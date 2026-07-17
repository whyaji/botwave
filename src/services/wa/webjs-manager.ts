import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { Client, LocalAuth } from 'whatsapp-web.js';

import { logger } from '@/src/common/utils/logger';
import { db } from '@/src/db/connection';
import { instances } from '@/src/db/schema/schema';

import { processCommandMessage } from './command-webhook.service';
import { notify } from './instance-manager';

const log = logger.child({ module: 'webjs-manager' });

const DATA_DIR = join(process.cwd(), 'data', 'auth');

const clients = new Map<number, Client>();
const openedInstances = new Set<number>();

function getAuthPath(instanceId: number): string {
  return join(DATA_DIR, '.wwebjs_auth', `session-${instanceId}`);
}

export async function connectWebjsInstance(instanceId: number): Promise<void> {
  if (clients.has(instanceId)) {
    await disconnectWebjsInstance(instanceId);
  }

  const authPath = getAuthPath(instanceId);
  await mkdir(DATA_DIR, { recursive: true });

  await db
    .update(instances)
    .set({ status: 'connecting', updatedAt: new Date() })
    .where(eq(instances.id, instanceId));

  notify(instanceId, { type: 'status', status: 'connecting' });

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: String(instanceId),
      dataPath: DATA_DIR,
    }),
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
      ],
    },
  });

  client.on('qr', async (qr) => {
    await db
      .update(instances)
      .set({ status: 'qr_required', updatedAt: new Date() })
      .where(eq(instances.id, instanceId));
    notify(instanceId, { type: 'qr', qr });
    notify(instanceId, { type: 'status', status: 'qr_required' });
  });

  client.on('ready', async () => {
    clients.set(instanceId, client);
    openedInstances.add(instanceId);
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
    log.info({ instanceId }, 'whatsapp-web.js client ready');
  });

  client.on('auth_failure', async (msg) => {
    log.error({ instanceId, msg }, 'whatsapp-web.js authentication failed');
  });

  client.on('disconnected', async (reason) => {
    log.info({ instanceId, reason }, 'whatsapp-web.js client disconnected');
    clients.delete(instanceId);
    openedInstances.delete(instanceId);
    await db
      .update(instances)
      .set({ status: 'disconnected', updatedAt: new Date() })
      .where(eq(instances.id, instanceId));
    notify(instanceId, {
      type: 'disconnected',
      reason: typeof reason === 'string' ? reason : undefined,
    });
    notify(instanceId, { type: 'status', status: 'disconnected' });
    try {
      await client.destroy();
    } catch {
      // ignore
    }
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const remoteJid = msg.from;
    const text = msg.body;
    if (typeof text !== 'string' || !text.startsWith('!')) return;

    // Convert @c.us to @s.whatsapp.net to preserve JID formatting for external webhooks
    const normalizedJid = remoteJid.replace('@c.us', '@s.whatsapp.net');

    processCommandMessage(instanceId, normalizedJid, text).catch((err) => {
      log.error({ err, instanceId, remoteJid }, 'Command webhook processing failed');
    });
  });

  clients.set(instanceId, client);
  client.initialize().catch(async (err) => {
    log.error({ err, instanceId }, 'Failed to initialize whatsapp-web.js client');
    clients.delete(instanceId);
    openedInstances.delete(instanceId);
    await db
      .update(instances)
      .set({ status: 'disconnected', updatedAt: new Date() })
      .where(eq(instances.id, instanceId));
    notify(instanceId, {
      type: 'disconnected',
      reason: err instanceof Error ? err.message : String(err),
    });
    notify(instanceId, { type: 'status', status: 'disconnected' });
    try {
      await client.destroy();
    } catch {
      // ignore
    }
  });
  log.info({ instanceId }, 'Instance client initialized');
}

export async function disconnectWebjsInstance(instanceId: number): Promise<void> {
  openedInstances.delete(instanceId);
  const client = clients.get(instanceId);
  if (client) {
    try {
      await client.destroy();
    } catch {
      // ignore
    }
    clients.delete(instanceId);
  }
  await db
    .update(instances)
    .set({ status: 'disconnected', updatedAt: new Date() })
    .where(eq(instances.id, instanceId));
  notify(instanceId, { type: 'status', status: 'disconnected' });
  log.info({ instanceId }, 'Instance disconnected');
}

export async function logoutWebjsInstance(instanceId: number): Promise<void> {
  const client = clients.get(instanceId);
  if (client) {
    try {
      await client.logout();
    } catch (err) {
      log.warn({ err, instanceId }, 'Client logout failed');
    }
  }
  await disconnectWebjsInstance(instanceId);

  const authPath = getAuthPath(instanceId);
  try {
    await rm(authPath, { recursive: true, force: true });
    log.info({ instanceId, authPath }, 'Auth state removed');
  } catch (err) {
    log.warn({ err, instanceId, authPath }, 'Auth path removal failed (may not exist)');
  }

  await db
    .update(instances)
    .set({ authStatePath: null, updatedAt: new Date() })
    .where(eq(instances.id, instanceId));
}

export function getWebjsClient(instanceId: number): Client | undefined {
  return clients.get(instanceId);
}

export function isWebjsConnected(instanceId: number): boolean {
  return clients.has(instanceId);
}

export function isWebjsConnectionOpen(instanceId: number): boolean {
  return openedInstances.has(instanceId);
}

export async function reconnectPreviouslyConnectedWebjsInstances(): Promise<void> {
  const rows = await db
    .select({ id: instances.id })
    .from(instances)
    .where(eq(instances.status, 'connected') && eq(instances.mode, 'webjs'));
  if (rows.length === 0) return;
  log.info(
    { count: rows.length, instanceIds: rows.map((r) => r.id) },
    'Reconnecting WebJS instances after restart'
  );
  const results = await Promise.allSettled(rows.map((r) => connectWebjsInstance(r.id)));
  results.forEach((outcome, i) => {
    if (outcome.status === 'rejected') {
      log.warn({ instanceId: rows[i]!.id, err: outcome.reason?.message }, 'Reconnect failed');
    }
  });
}
