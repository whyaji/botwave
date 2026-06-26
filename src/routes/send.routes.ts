import { Hono } from 'hono';
import path from 'path';
import { z } from 'zod';

import { db } from '@/src/db/connection';
import { jobs } from '@/src/db/schema/schema';
import { waSendQueue } from '@/src/services/queue/wa-send-queue';
import { isConnected } from '@/src/services/wa/instance-manager';

import { apiKeyAuthMiddleware } from '../common/middleware/api-key-auth.middleware';
import { logger } from '../common/utils/logger';
import { errorResponse, successResponse } from '../common/utils/response';

const toSchema = z.union([z.string().min(1), z.array(z.string().min(1))]);

const sendTextSchema = z.object({
  to: toSchema,
  text: z.string().min(1),
});

const FILE_TYPES = ['image', 'video', 'audio', 'document'] as const;
const sendFileSchema = z.object({
  to: toSchema,
  fileUrl: z.string().url(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.enum(FILE_TYPES).optional(),
});

export const sendRoutes = new Hono();

sendRoutes.use('*', apiKeyAuthMiddleware);

function normalizeTo(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

sendRoutes.post('/text', async (c) => {
  const parsed = sendTextSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }
  const { instanceId, appId } = c.get('jwtPayload') as { instanceId: number; appId: number };

  if (!isConnected(instanceId)) {
    return errorResponse(c, 'BAD_REQUEST', 'Instance is not connected', 400);
  }

  const to = normalizeTo(parsed.data.to);
  const [jobRow] = await db
    .insert(jobs)
    .values({
      type: 'send_wa_message',
      payload: {
        instanceId,
        appId,
        to,
        text: parsed.data.text,
      },
      status: 'Pending',
      createdBy: appId,
    })
    .returning({ id: jobs.id });

  if (!jobRow) {
    return errorResponse(c, 'INTERNAL_ERROR', 'Failed to create job', 500);
  }

  await waSendQueue.add(
    'send',
    {
      dbJobId: jobRow.id,
      instanceId,
      appId,
      to,
      text: parsed.data.text,
    },
    { jobId: `wa-send-${jobRow.id}` }
  );

  return successResponse(c, {
    jobId: String(jobRow.id),
    status: 'queued',
  });
});

sendRoutes.post('/file', async (c) => {
  const parsed = sendFileSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }
  const { instanceId, appId } = c.get('jwtPayload') as { instanceId: number; appId: number };

  if (!isConnected(instanceId)) {
    return errorResponse(c, 'BAD_REQUEST', 'Instance is not connected', 400);
  }

  const to = normalizeTo(parsed.data.to);
  const [jobRow] = await db
    .insert(jobs)
    .values({
      type: 'send_wa_message',
      payload: {
        instanceId,
        appId,
        to,
        fileUrl: parsed.data.fileUrl,
        caption: parsed.data.caption,
        fileName: parsed.data.fileName,
        fileType: parsed.data.fileType,
      },
      status: 'Pending',
      createdBy: appId,
    })
    .returning({ id: jobs.id });

  if (!jobRow) {
    return errorResponse(c, 'INTERNAL_ERROR', 'Failed to create job', 500);
  }

  await waSendQueue.add(
    'send',
    {
      dbJobId: jobRow.id,
      instanceId,
      appId,
      to,
      fileUrl: parsed.data.fileUrl,
      caption: parsed.data.caption,
      fileName: parsed.data.fileName,
      fileType: parsed.data.fileType,
    },
    { jobId: `wa-send-${jobRow.id}` }
  );

  return successResponse(c, {
    jobId: String(jobRow.id),
    status: 'queued',
  });
});

sendRoutes.post('/raw-file', async (c) => {
  const body = await c.req.parseBody();
  const rawTo = body['to'];
  const caption = typeof body['caption'] === 'string' ? body['caption'] : undefined;
  const file = body['file'];

  if (!rawTo) {
    return errorResponse(c, 'VALIDATION_ERROR', 'to is required', 400);
  }

  let to: string[] = [];
  if (typeof rawTo === 'string') {
    if (rawTo.startsWith('[') && rawTo.endsWith(']')) {
      try {
        to = JSON.parse(rawTo);
      } catch {
        to = [rawTo];
      }
    } else {
      to = rawTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } else if (Array.isArray(rawTo)) {
    to = rawTo as string[];
  }

  if (to.length === 0) {
    return errorResponse(c, 'VALIDATION_ERROR', 'At least one recipient is required', 400);
  }

  if (!file || !(file instanceof File)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'file is required and must be a valid file', 400);
  }

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(
      c,
      'VALIDATION_ERROR',
      'File size exceeds the 100 MB limit (100 MB maximum)',
      400
    );
  }

  const { instanceId, appId } = c.get('jwtPayload') as { instanceId: number; appId: number };

  if (!isConnected(instanceId)) {
    return errorResponse(c, 'BAD_REQUEST', 'Instance is not connected', 400);
  }

  const tempDir = path.join(process.cwd(), 'storage/app/temp');
  const fileExt = file.name ? file.name.split('.').pop() : '';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${fileExt ? '.' + fileExt : ''}`;
  const filePath = path.join(tempDir, fileName);

  try {
    const bytes = await file.arrayBuffer();
    await Bun.write(filePath, bytes);
  } catch (err) {
    logger.error({ err }, 'Failed to save file');
    return errorResponse(c, 'INTERNAL_ERROR', 'Failed to save file', 500);
  }

  const [jobRow] = await db
    .insert(jobs)
    .values({
      type: 'send_wa_message',
      payload: {
        instanceId,
        appId,
        to,
        filePath,
        caption,
        fileName: file.name,
      },
      status: 'Pending',
      createdBy: appId,
    })
    .returning({ id: jobs.id });

  if (!jobRow) {
    try {
      await Bun.file(filePath).delete();
    } catch {
      // ignore
    }
    return errorResponse(c, 'INTERNAL_ERROR', 'Failed to create job', 500);
  }

  await waSendQueue.add(
    'send',
    {
      dbJobId: jobRow.id,
      instanceId,
      appId,
      to,
      filePath,
      caption,
      fileName: file.name,
    },
    { jobId: `wa-send-${jobRow.id}` }
  );

  return successResponse(c, {
    jobId: String(jobRow.id),
    status: 'queued',
  });
});
