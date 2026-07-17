import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';

import { logger } from '@/src/common/utils/logger';
import { db } from '@/src/db/connection';
import { instances, settings } from '@/src/db/schema/schema';

import {
  connectInstance,
  disconnectInstance,
  reconnectPreviouslyConnectedInstances,
} from '../wa/instance-manager';

const log = logger.child({ module: 'scheduler' });

let currentIsInactive = false;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let workerInstance: Worker | null = null;

function isTimeInInterval(current: string, start: string, end: string): boolean {
  if (start <= end) {
    return current >= start && current <= end;
  } else {
    // Crosses midnight, e.g. 23:00 - 02:00
    return current >= start || current <= end;
  }
}

export async function getInactiveStatus(): Promise<{ isInactive: boolean; ranges: string[] }> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'INACTIVE_SCHEDULED'))
    .limit(1);

  if (!row || !row.value.trim()) {
    return { isInactive: false, ranges: [] };
  }

  const ranges = row.value
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const current = `${hh}:${mm}`;

  for (const range of ranges) {
    const parts = range.split('-');
    if (parts.length === 2) {
      const [start, end] = parts;
      if (start && end && isTimeInInterval(current, start, end)) {
        return { isInactive: true, ranges };
      }
    }
  }

  return { isInactive: false, ranges };
}

async function getSuspendedInstances(): Promise<number[]> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, '_suspended_instances'))
    .limit(1);
  if (!row) return [];
  try {
    return JSON.parse(row.value) as number[];
  } catch {
    return [];
  }
}

async function saveSuspendedInstances(ids: number[]): Promise<void> {
  await db
    .insert(settings)
    .values({
      key: '_suspended_instances',
      value: JSON.stringify(ids),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(ids), updatedAt: new Date() },
    });
}

async function clearSuspendedInstances(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, '_suspended_instances'));
}

export async function checkScheduleTransition(): Promise<void> {
  try {
    const { isInactive } = await getInactiveStatus();

    if (isInactive && !currentIsInactive) {
      log.info('Entering inactive scheduled period. Suspending services...');
      currentIsInactive = true;

      // 1. Pause worker
      if (workerInstance) {
        try {
          await workerInstance.pause();
          log.info('BullMQ worker paused');
        } catch (err) {
          log.error({ err }, 'Failed to pause BullMQ worker');
        }
      }

      // 2. Disconnect active/connecting instances and save their IDs
      const activeRows = await db
        .select({ id: instances.id })
        .from(instances)
        .where(eq(instances.status, 'connected'));
      const activeIds = activeRows.map((r) => r.id);

      if (activeIds.length > 0) {
        log.info({ activeIds }, 'Suspending active instances');
        await saveSuspendedInstances(activeIds);
        for (const id of activeIds) {
          try {
            await disconnectInstance(id);
          } catch (err) {
            log.error({ err, id }, 'Error disconnecting instance during scheduler suspend');
          }
        }
      }
    } else if (!isInactive && currentIsInactive) {
      log.info('Leaving inactive scheduled period. Resuming services...');
      currentIsInactive = false;

      // 1. Resume worker
      if (workerInstance) {
        try {
          await workerInstance.resume();
          log.info('BullMQ worker resumed');
        } catch (err) {
          log.error({ err }, 'Failed to resume BullMQ worker');
        }
      }

      // 2. Reconnect previously suspended instances
      const suspendedIds = await getSuspendedInstances();
      if (suspendedIds.length > 0) {
        log.info({ suspendedIds }, 'Reconnecting suspended instances');
        const results = await Promise.allSettled(suspendedIds.map((id) => connectInstance(id)));
        results.forEach((outcome, i) => {
          if (outcome.status === 'rejected') {
            log.warn(
              { id: suspendedIds[i], err: outcome.reason?.message },
              'Failed to reconnect instance after inactive schedule'
            );
          }
        });
        await clearSuspendedInstances();
      }
    }
  } catch (err) {
    log.error({ err }, 'Error in schedule transition check');
  }
}

export async function initializeScheduler(worker: Worker): Promise<void> {
  workerInstance = worker;

  const { isInactive } = await getInactiveStatus();
  currentIsInactive = isInactive;

  if (isInactive) {
    log.info('Started server during inactive scheduled period. Suspending services...');
    if (workerInstance) {
      try {
        await workerInstance.pause();
        log.info('BullMQ worker paused');
      } catch (err) {
        log.error({ err }, 'Failed to pause BullMQ worker');
      }
    }

    // Save any currently connected instances (in case status was left 'connected' in DB)
    const activeRows = await db
      .select({ id: instances.id })
      .from(instances)
      .where(eq(instances.status, 'connected'));
    const activeIds = activeRows.map((r) => r.id);
    if (activeIds.length > 0) {
      await saveSuspendedInstances(activeIds);
      for (const id of activeIds) {
        try {
          await disconnectInstance(id);
        } catch (err) {
          log.error({ err, id }, 'Error disconnecting instance during startup suspend');
        }
      }
    }
  } else {
    log.info('Started server during active period.');
    if (workerInstance) {
      try {
        await workerInstance.resume();
      } catch (err) {
        log.error({ err }, 'Failed to resume BullMQ worker');
      }
    }

    // If there are suspended instances left over from a previous shutdown during inactive period
    const suspendedIds = await getSuspendedInstances();
    if (suspendedIds.length > 0) {
      log.info({ suspendedIds }, 'Reconnecting previously suspended instances on startup');
      await Promise.allSettled(suspendedIds.map((id) => connectInstance(id)));
      await clearSuspendedInstances();
    } else {
      log.info('No suspended instances found. Reconnecting normal active instances...');
      await reconnectPreviouslyConnectedInstances().catch((err) =>
        log.error({ err }, 'Reconnect of previously connected instances failed')
      );
    }
  }

  // Start polling schedule every 30 seconds
  checkInterval = setInterval(() => {
    checkScheduleTransition();
  }, 30000);
}

export function stopScheduler(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
