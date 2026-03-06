import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '@/src/db/connection';
import { jobs } from '@/src/db/schema/schema';
import { waSendQueue } from '@/src/services/queue/wa-send-queue';
import { isConnected } from '@/src/services/wa/instance-manager';

import { apiKeyAuthMiddleware } from '../common/middleware/api-key-auth.middleware';
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
