import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { WASocket } from '@whiskeysockets/baileys';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';

import { logger } from '@/src/common/utils/logger';
import { db } from '@/src/db/connection';
import { instances } from '@/src/db/schema/schema';

/**
 * Instance manager for Baileys v7 (https://baileys.wiki/docs/migration/to-v7.0.0).
 * - Uses ESM; auth state from useMultiFileAuthState supports LID keys (lid-mapping, device-list, tctoken).
 * - We do not send ACKs on message delivery (v7 removes this; WhatsApp may ban otherwise).
 * - sendMessage accepts both PN and LID JIDs; worker passes through job payload as-is.
 */
const log = logger.child({ module: 'instance-manager' });

const DATA_DIR = join(process.cwd(), 'data', 'auth');
const MAX_CONNECT_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
/** Status codes that are worth retrying (transient/server failure during pairing). */
const RETRYABLE_STATUS_CODES = new Set([408, 500, 503]); // connectionLost/timedOut, badSession, unavailableService

export type WsInstanceMessage =
  | { type: 'qr'; qr: string }
  | { type: 'status'; status: string }
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string };

const sockets = new Map<number, WASocket>();
const subscribers = new Map<number, Set<(msg: WsInstanceMessage) => void>>();
const retryCount = new Map<number, number>();
const openedInstances = new Set<number>();
/** Ensures close handler runs only once per instance (Baileys may emit close twice). */
const handlingClose = new Set<number>();
/** Pending retry timeouts so we only have one retry per instance and can cancel on disconnect. */
const retryTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

function getAuthPath(instanceId: number): string {
  return join(DATA_DIR, String(instanceId));
}

function notify(instanceId: number, msg: WsInstanceMessage) {
  const set = subscribers.get(instanceId);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(msg);
      } catch (err) {
        log.error({ err, instanceId }, 'Subscriber callback error');
      }
    });
  }
}

function isRetryableDisconnect(
  lastDisconnect: { error?: { message?: string; output?: { statusCode?: number } } } | undefined
): boolean {
  if (!lastDisconnect?.error) return false;
  const statusCode = lastDisconnect.error.output?.statusCode;
  const msg = lastDisconnect.error.message ?? '';
  if (statusCode !== undefined && RETRYABLE_STATUS_CODES.has(statusCode)) return true;
  if (
    msg.includes('Connection Failure') ||
    msg.includes('Connection was lost') ||
    msg.includes('Connection Terminated')
  )
    return true;
  return false;
}

function clearRetryTimeout(instanceId: number): void {
  const id = retryTimeouts.get(instanceId);
  if (id !== undefined) {
    clearTimeout(id);
    retryTimeouts.delete(instanceId);
  }
}

export async function connectInstance(instanceId: number, isRetry = false): Promise<void> {
  clearRetryTimeout(instanceId);
  if (sockets.has(instanceId)) {
    await disconnectInstance(instanceId);
  }

  if (!isRetry) {
    retryCount.set(instanceId, 0);
  }

  const authPath = getAuthPath(instanceId);
  await mkdir(authPath, { recursive: true });

  await db
    .update(instances)
    .set({ status: 'connecting', updatedAt: new Date() })
    .where(eq(instances.id, instanceId));

  notify(instanceId, { type: 'status', status: 'connecting' });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    version: [2, 3000, 1033893291],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    if (update.qr) {
      await db
        .update(instances)
        .set({ status: 'qr_required', updatedAt: new Date() })
        .where(eq(instances.id, instanceId));
      notify(instanceId, { type: 'qr', qr: update.qr });
      notify(instanceId, { type: 'status', status: 'qr_required' });
    }

    if (update.connection === 'open') {
      sockets.set(instanceId, sock);
      openedInstances.add(instanceId);
      retryCount.delete(instanceId);
      await db
        .update(instances)
        .set({
          status: 'connected',
          lastConnectedAt: new Date(),
          authStatePath: authPath,
          updatedAt: new Date(),
        })
        .where(eq(instances.id, instanceId));
      notify(instanceId, { type: 'connected' });
      notify(instanceId, { type: 'status', status: 'connected' });
    }

    if (update.connection === 'close') {
      if (handlingClose.has(instanceId)) return;
      handlingClose.add(instanceId);
      try {
        const reason = update.lastDisconnect?.error?.message ?? 'Unknown';
        const currentRetries = retryCount.get(instanceId) ?? 0;
        const wasOpened = openedInstances.has(instanceId);
        sockets.delete(instanceId);
        openedInstances.delete(instanceId);

        if (
          !wasOpened &&
          isRetryableDisconnect(update.lastDisconnect) &&
          currentRetries < MAX_CONNECT_RETRIES
        ) {
          retryCount.set(instanceId, currentRetries + 1);
          log.info(
            { instanceId, attempt: currentRetries + 1, reason },
            'Connection failed, retrying...'
          );
          await db
            .update(instances)
            .set({ status: 'connecting', updatedAt: new Date() })
            .where(eq(instances.id, instanceId));
          notify(instanceId, { type: 'status', status: 'connecting' });
          const timeoutId = setTimeout(() => {
            retryTimeouts.delete(instanceId);
            connectInstance(instanceId, true);
          }, RETRY_DELAY_MS);
          retryTimeouts.set(instanceId, timeoutId);
          return;
        }

        retryCount.delete(instanceId);
        await db
          .update(instances)
          .set({ status: 'disconnected', updatedAt: new Date() })
          .where(eq(instances.id, instanceId));
        notify(instanceId, { type: 'disconnected', reason });
        notify(instanceId, { type: 'status', status: 'disconnected' });
      } finally {
        handlingClose.delete(instanceId);
      }
    }
  });

  sockets.set(instanceId, sock);
  log.info({ instanceId }, 'Instance socket created');
}

export async function disconnectInstance(instanceId: number): Promise<void> {
  clearRetryTimeout(instanceId);
  retryCount.delete(instanceId);
  openedInstances.delete(instanceId);
  const sock = sockets.get(instanceId);
  if (sock) {
    try {
      const ws = (sock as unknown as { ws?: { close: () => void } }).ws;
      if (ws?.close) ws.close();
    } catch {
      // ignore
    }
    sockets.delete(instanceId);
  }
  await db
    .update(instances)
    .set({ status: 'disconnected', updatedAt: new Date() })
    .where(eq(instances.id, instanceId));
  notify(instanceId, { type: 'status', status: 'disconnected' });
  log.info({ instanceId }, 'Instance disconnected');
}

export function getSocket(instanceId: number): WASocket | undefined {
  return sockets.get(instanceId);
}

export function isConnected(instanceId: number): boolean {
  return sockets.has(instanceId);
}

/**
 * On server restart, reconnects all instances that were previously connected (status = 'connected' in DB).
 * Sockets are lost on restart; this restores them from persisted auth state.
 */
export async function reconnectPreviouslyConnectedInstances(): Promise<void> {
  const rows = await db
    .select({ id: instances.id })
    .from(instances)
    .where(eq(instances.status, 'connected'));
  if (rows.length === 0) return;
  log.info(
    { count: rows.length, instanceIds: rows.map((r) => r.id) },
    'Reconnecting instances after restart'
  );
  const results = await Promise.allSettled(rows.map((r) => connectInstance(r.id)));
  results.forEach((outcome, i) => {
    if (outcome.status === 'rejected') {
      log.warn({ instanceId: rows[i]!.id, err: outcome.reason?.message }, 'Reconnect failed');
    }
  });
}

export function subscribe(
  instanceId: number,
  callback: (msg: WsInstanceMessage) => void
): () => void {
  let set = subscribers.get(instanceId);
  if (!set) {
    set = new Set();
    subscribers.set(instanceId, set);
  }
  set.add(callback);
  return () => {
    set!.delete(callback);
    if (set!.size === 0) {
      subscribers.delete(instanceId);
    }
  };
}
