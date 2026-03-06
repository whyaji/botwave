import 'dotenv/config';

import type { AnyMessageContent } from '@whiskeysockets/baileys';
import { Worker } from 'bullmq';
import { eq, lt } from 'drizzle-orm';

import { logger } from '@/src/common/utils/logger';
import { bullConnection } from '@/src/config/bull-redis';
import { db } from '@/src/db/connection';
import { jobs } from '@/src/db/schema/schema';
import { JOBS_CLEANUP_QUEUE_NAME } from '@/src/services/queue/jobs-cleanup-queue';
import type { WaSendFileType, WaSendJobPayload } from '@/src/services/queue/wa-send-queue';
import { WA_SEND_QUEUE_NAME } from '@/src/services/queue/wa-send-queue';
import { getSocket } from '@/src/services/wa/instance-manager';

const log = logger.child({ module: 'worker' });

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', '3gp', 'm4v']);
const AUDIO_EXT = new Set(['mp3', 'ogg', 'm4a', 'aac', 'wav', 'oga', 'opus']);

const EXT_TO_MIMETYPE: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
};

function getExtension(fileName?: string, fileUrl?: string): string {
  if (fileName?.includes('.')) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }
  if (fileUrl) {
    try {
      const pathname = new URL(fileUrl).pathname;
      const match = pathname.match(/\.([a-z0-9]+)(?:\?|$)/i);
      if (match) return match[1].toLowerCase();
    } catch {
      // ignore
    }
  }
  return '';
}

function resolveFileType(
  fileType?: WaSendFileType,
  fileName?: string,
  fileUrl?: string
): WaSendFileType {
  if (fileType) return fileType;
  const ext = getExtension(fileName, fileUrl);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'document';
}

function getMimetype(fileName?: string, fileUrl?: string): string {
  const ext = getExtension(fileName, fileUrl);
  return EXT_TO_MIMETYPE[ext] ?? 'application/octet-stream';
}

/** Normalize "to" to a full Baileys JID. Phone numbers become number@s.whatsapp.net; group IDs stay as-is. */
function normalizeJid(to: string): string {
  if (to.includes('@')) return to;
  const digits = to.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function buildFileContent(
  fileUrl: string,
  fileType: WaSendFileType,
  caption?: string,
  fileName?: string
): AnyMessageContent {
  const base = { url: fileUrl };
  switch (fileType) {
    case 'image':
      return caption ? { image: base, caption } : { image: base };
    case 'video':
      return caption ? { video: base, caption } : { video: base };
    case 'audio':
      return { audio: base };
    case 'document':
    default: {
      const doc: {
        document: { url: string; fileName?: string };
        caption?: string;
        mimetype: string;
      } = {
        document: { ...base, fileName: fileName ?? undefined },
        mimetype: getMimetype(fileName, fileUrl),
      };
      if (caption) doc.caption = caption;
      return doc as AnyMessageContent;
    }
  }
}

export function startWorker() {
  const worker = new Worker<WaSendJobPayload>(
    WA_SEND_QUEUE_NAME,
    async (job) => {
      const {
        dbJobId,
        instanceId,
        to,
        text,
        fileUrl,
        caption,
        fileName,
        fileType: explicitFileType,
      } = job.data;

      await db
        .update(jobs)
        .set({
          status: 'Processing',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, dbJobId));

      const sock = getSocket(instanceId);
      if (!sock) {
        await db
          .update(jobs)
          .set({
            status: 'Failed',
            lastError: 'Instance not connected',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, dbJobId));
        throw new Error('Instance not connected');
      }

      const errors: string[] = [];
      const results: { jid: string; success: boolean; error?: string }[] = [];

      for (const rawTo of to) {
        const jid = normalizeJid(rawTo);
        try {
          if (text) {
            await sock.sendMessage(jid, { text });
            results.push({ jid: rawTo, success: true });
          } else if (fileUrl) {
            const fileType = resolveFileType(explicitFileType, fileName, fileUrl);
            const content = buildFileContent(fileUrl, fileType, caption, fileName);
            await sock.sendMessage(jid, content);
            results.push({ jid: rawTo, success: true });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${rawTo}: ${msg}`);
          results.push({ jid: rawTo, success: false, error: msg });
        }
      }

      const allOk = errors.length === 0;
      await db
        .update(jobs)
        .set({
          status: allOk ? 'Completed' : 'Failed',
          result: { results },
          lastError: allOk ? null : errors.join('; '),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, dbJobId));

      if (!allOk) {
        throw new Error(errors.join('; '));
      }
      return { results };
    },
    {
      connection: bullConnection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err?.message }, 'Job failed');
  });

  worker.on('error', (err) => {
    log.error({ err }, 'Worker error');
  });

  const cleanupWorker = new Worker(
    JOBS_CLEANUP_QUEUE_NAME,
    async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const deleted = await db
        .delete(jobs)
        .where(lt(jobs.createdAt, cutoff))
        .returning({ id: jobs.id });
      const count = deleted.length;
      log.info({ count, cutoff: cutoff.toISOString() }, 'Jobs cleanup: deleted old jobs');
      return { deleted: count };
    },
    { connection: bullConnection, concurrency: 1 }
  );

  cleanupWorker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Jobs cleanup completed');
  });
  cleanupWorker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err?.message }, 'Jobs cleanup failed');
  });

  log.info('BotWave worker started');
  return worker;
}
