import 'dotenv/config';

import type { AnyMessageContent } from '@whiskeysockets/baileys';
import { Worker } from 'bullmq';
import { eq, lt } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

import { logger } from '@/src/common/utils/logger';
import { bullConnection } from '@/src/config/bull-redis';
import { db } from '@/src/db/connection';
import { instances, jobs } from '@/src/db/schema/schema';
import { JOBS_CLEANUP_QUEUE_NAME } from '@/src/services/queue/jobs-cleanup-queue';
import type { WaSendFileType, WaSendJobPayload } from '@/src/services/queue/wa-send-queue';
import { WA_SEND_QUEUE_NAME } from '@/src/services/queue/wa-send-queue';
import { getSocket } from '@/src/services/wa/instance-manager';

const log = logger.child({ module: 'worker' });

/** Max time to wait for socket / connection open (Baileys AwaitingInitialSync can take ~20s). */
const WAIT_FOR_CONNECTION_MS = 28_000;
const WAIT_POLL_INTERVAL_MS = 2000;

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

function getExtension(fileName?: string, fileUrlOrPath?: string): string {
  if (fileName?.includes('.')) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }
  if (fileUrlOrPath) {
    if (fileUrlOrPath.startsWith('http://') || fileUrlOrPath.startsWith('https://')) {
      try {
        const pathname = new URL(fileUrlOrPath).pathname;
        const match = pathname.match(/\.([a-z0-9]+)(?:\?|$)/i);
        if (match) return match[1].toLowerCase();
      } catch {
        // ignore
      }
    } else {
      const ext = fileUrlOrPath.split('.').pop()?.toLowerCase();
      if (ext) return ext;
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
        document: { url: string };
        fileName?: string;
        caption?: string;
        mimetype: string;
      } = {
        document: base,
        fileName: fileName ?? undefined,
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
        filePath,
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

      let sock = getSocket(instanceId);
      if (!sock) {
        const [instance] = await db
          .select({ status: instances.status })
          .from(instances)
          .where(eq(instances.id, instanceId))
          .limit(1);
        const canRetry =
          instance && (instance.status === 'connected' || instance.status === 'connecting');
        if (canRetry) {
          const deadline = Date.now() + WAIT_FOR_CONNECTION_MS;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, WAIT_POLL_INTERVAL_MS));
            sock = getSocket(instanceId);
            if (sock) break;
          }
        }
        if (!sock) {
          if (canRetry) {
            log.warn(
              { instanceId, jobId: job.id },
              'Instance not ready yet (socket missing), throwing for retry'
            );
            throw new Error('Instance not connected');
          }
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
      }

      const errors: string[] = [];
      const results: { jid: string; success: boolean; error?: string }[] = [];

      for (const rawTo of to) {
        const jid = normalizeJid(rawTo);
        try {
          if (text) {
            await sock.sendMessage(jid, { text });
            results.push({ jid: rawTo, success: true });
          } else if (fileUrl || filePath) {
            const source = fileUrl || filePath;
            if (!source) throw new Error('No media source provided');
            const fileType = resolveFileType(explicitFileType, fileName, source);
            const content = buildFileContent(source, fileType, caption, fileName);
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

      if (allOk && filePath) {
        try {
          await fs.promises.unlink(filePath);
          log.info({ filePath, jobId: job.id }, 'Temporary file deleted after successful job');
        } catch (err) {
          log.error({ filePath, err, jobId: job.id }, 'Failed to delete temporary file on success');
        }
      }

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
      cutoff.setDate(cutoff.getDate() - 90); // 3 months (90 days)

      // 1. Delete files of failed/old jobs using DB records
      const oldJobs = await db
        .select({ id: jobs.id, payload: jobs.payload })
        .from(jobs)
        .where(lt(jobs.createdAt, cutoff));

      let deletedJobFilesCount = 0;
      for (const jobRow of oldJobs) {
        const payload = jobRow.payload as WaSendJobPayload | null;
        if (payload && payload.filePath) {
          try {
            if (fs.existsSync(payload.filePath)) {
              await fs.promises.unlink(payload.filePath);
              deletedJobFilesCount++;
            }
          } catch (err) {
            log.error(
              { filePath: payload.filePath, err },
              'Failed to delete old job file during cleanup'
            );
          }
        }
      }

      // 2. Delete database records older than 3 months
      const deleted = await db
        .delete(jobs)
        .where(lt(jobs.createdAt, cutoff))
        .returning({ id: jobs.id });
      const count = deleted.length;

      // 3. Scan storage/app/temp directory for files older than 3 months
      const tempDir = path.join(process.cwd(), 'storage/app/temp');
      let cleanedTempFiles = 0;
      if (fs.existsSync(tempDir)) {
        try {
          const files = await fs.promises.readdir(tempDir);
          const now = Date.now();
          const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
          for (const file of files) {
            if (file === '.gitignore') continue;
            const filePath = path.join(tempDir, file);
            const stats = await fs.promises.stat(filePath);
            if (now - stats.mtimeMs > threeMonthsMs) {
              await fs.promises.unlink(filePath);
              cleanedTempFiles++;
            }
          }
        } catch (err) {
          log.error({ err }, 'Failed to clean storage/app/temp directory');
        }
      }

      // 4. Scan storage/logs directory for log files older than 3 months
      const logsDir = path.join(process.cwd(), 'storage/logs');
      let cleanedLogFiles = 0;
      if (fs.existsSync(logsDir)) {
        try {
          const files = await fs.promises.readdir(logsDir);
          const now = Date.now();
          const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
          for (const file of files) {
            if (file === '.gitignore') continue;
            const filePath = path.join(logsDir, file);
            const stats = await fs.promises.stat(filePath);
            if (now - stats.mtimeMs > threeMonthsMs) {
              await fs.promises.unlink(filePath);
              cleanedLogFiles++;
            }
          }
        } catch (err) {
          log.error({ err }, 'Failed to clean storage/logs directory');
        }
      }

      log.info(
        {
          deletedJobs: count,
          deletedJobFilesFromDb: deletedJobFilesCount,
          cleanedTempFiles,
          cleanedLogFiles,
          cutoff: cutoff.toISOString(),
        },
        'Jobs cleanup completed'
      );
      return {
        deletedJobs: count,
        deletedJobFilesFromDb: deletedJobFilesCount,
        cleanedTempFiles,
        cleanedLogFiles,
      };
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
