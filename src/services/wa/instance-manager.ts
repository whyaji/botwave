import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { WASocket } from '@whiskeysockets/baileys';
import makeWASocket, {
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { eq, isNotNull, or } from 'drizzle-orm';

import { logger } from '@/src/common/utils/logger';
import { db } from '@/src/db/connection';
import { instances } from '@/src/db/schema/schema';

import { processCommandMessage } from './command-webhook.service';
import {
  connectWebjsInstance,
  disconnectWebjsInstance,
  isWebjsConnected,
  isWebjsConnectionOpen,
  logoutWebjsInstance,
} from './webjs-manager';

const log = logger.child({ module: 'instance-manager' });

const DATA_DIR = join(process.cwd(), 'data', 'auth');
const MAX_CONNECT_RETRIES = 3;
const MAX_RECONNECT_RETRIES = 15;
const RETRY_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 120_000;
const RETRYABLE_STATUS_CODES = new Set([408, 500, 503, 515]);

export type WsInstanceMessage =
  | { type: 'qr'; qr: string }
  | { type: 'status'; status: string }
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string };

const sockets = new Map<number, WASocket>();
const subscribers = new Map<number, Set<(msg: WsInstanceMessage) => void>>();
const retryCount = new Map<number, number>();
const openedInstances = new Set<number>();
const handlingClose = new Set<number>();
const retryTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

function getAuthPath(instanceId: number): string {
  return join(DATA_DIR, String(instanceId));
}

export function notify(instanceId: number, msg: WsInstanceMessage) {
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
    msg.includes('Connection Terminated') ||
    msg.includes('Stream Errored') ||
    msg.includes('restart required') ||
    msg.includes('Buffer timeout') ||
    msg.includes('timed out') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT')
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
  const [inst] = await db
    .select({ mode: instances.mode })
    .from(instances)
    .where(eq(instances.id, instanceId))
    .limit(1);

  if (inst?.mode === 'webjs') {
    return connectWebjsInstance(instanceId);
  }

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
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    version,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ type, messages }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid) continue;
      const content = msg.message;
      if (!content) continue;
      const text =
        (content as { conversation?: string }).conversation ??
        (content as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text;
      if (typeof text !== 'string' || !text.startsWith('!')) continue;
      processCommandMessage(instanceId, remoteJid, text).catch((err) => {
        log.error({ err, instanceId, remoteJid }, 'Command webhook processing failed');
      });
    }
  });

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

        const retryable = isRetryableDisconnect(update.lastDisconnect);
        const maxRetries = wasOpened ? MAX_RECONNECT_RETRIES : MAX_CONNECT_RETRIES;
        const underLimit = currentRetries < maxRetries;

        if (retryable && underLimit) {
          const nextAttempt = currentRetries + 1;
          retryCount.set(instanceId, nextAttempt);
          const delayMs = wasOpened
            ? Math.min(RETRY_DELAY_MS * Math.pow(2, currentRetries), MAX_RECONNECT_DELAY_MS)
            : RETRY_DELAY_MS;
          log.info(
            { instanceId, attempt: nextAttempt, reason, wasOpened, delayMs },
            wasOpened ? 'Disconnected, reconnecting...' : 'Connection failed, retrying...'
          );
          await db
            .update(instances)
            .set({ status: 'connecting', updatedAt: new Date() })
            .where(eq(instances.id, instanceId));
          notify(instanceId, { type: 'status', status: 'connecting' });
          const timeoutId = setTimeout(() => {
            retryTimeouts.delete(instanceId);
            connectInstance(instanceId, true);
          }, delayMs);
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
  const [inst] = await db
    .select({ mode: instances.mode })
    .from(instances)
    .where(eq(instances.id, instanceId))
    .limit(1);

  if (inst?.mode === 'webjs') {
    return disconnectWebjsInstance(instanceId);
  }

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

export async function logoutInstance(instanceId: number): Promise<void> {
  const [inst] = await db
    .select({ mode: instances.mode })
    .from(instances)
    .where(eq(instances.id, instanceId))
    .limit(1);

  if (inst?.mode === 'webjs') {
    return logoutWebjsInstance(instanceId);
  }

  await disconnectInstance(instanceId);
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

export function getSocket(instanceId: number): WASocket | undefined {
  return sockets.get(instanceId);
}

export function isConnected(instanceId: number): boolean {
  return sockets.has(instanceId) || isWebjsConnected(instanceId);
}

export function isConnectionOpen(instanceId: number): boolean {
  return openedInstances.has(instanceId) || isWebjsConnectionOpen(instanceId);
}

export async function reconnectPreviouslyConnectedInstances(): Promise<void> {
  const rows = await db
    .select({ id: instances.id })
    .from(instances)
    .where(or(eq(instances.status, 'connected'), isNotNull(instances.authStatePath)));
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
