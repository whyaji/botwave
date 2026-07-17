import type { WASocket } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { Chat, Client } from 'whatsapp-web.js';
import { z } from 'zod';

import { db } from '@/src/db/connection';
import { instances } from '@/src/db/schema/schema';
import {
  connectInstance,
  disconnectInstance,
  getSocket,
  logoutInstance,
} from '@/src/services/wa/instance-manager';
import { getWebjsClient } from '@/src/services/wa/webjs-manager';

import { authMiddleware } from '../common/middleware/auth.middleware';
import { errorResponse, successResponse } from '../common/utils/response';

const createInstanceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  mode: z.enum(['baileys', 'webjs']).optional().default('baileys'),
});

export const instancesRoutes = new Hono();

instancesRoutes.use('*', authMiddleware);

instancesRoutes.get('/', async (c) => {
  const list = await db.select().from(instances).orderBy(instances.createdAt);
  return successResponse(c, list);
});

instancesRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  return successResponse(c, row);
});

instancesRoutes.post('/', async (c) => {
  const parsed = createInstanceSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }
  const userId = (c.get('jwtPayload') as { sub: number }).sub;
  const [inserted] = await db
    .insert(instances)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      mode: parsed.data.mode,
      status: 'disconnected',
      createdBy: userId,
    })
    .returning();
  return successResponse(c, inserted!, 201);
});

instancesRoutes.post('/:id/connect', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  try {
    await connectInstance(id);
    const [updated] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
    return successResponse(c, updated!);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Connect failed',
      500
    );
  }
});

instancesRoutes.get('/:id/groups', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  if (row.status !== 'connected') {
    return errorResponse(c, 'VALIDATION_ERROR', 'Instance must be connected', 400);
  }
  const isWebjs = row.mode === 'webjs';
  const sock = isWebjs ? getWebjsClient(id) : getSocket(id);
  if (!sock) {
    await db
      .update(instances)
      .set({ status: 'disconnected', updatedAt: new Date() })
      .where(eq(instances.id, id));
    return errorResponse(
      c,
      'VALIDATION_ERROR',
      'Instance is no longer connected (e.g. after server restart). Please connect again.',
      400
    );
  }
  try {
    if (isWebjs) {
      const client = sock as Client;
      const chats = await client.getChats();
      const groups = chats
        .filter((chat: Chat) => chat.isGroup)
        .map((chat: Chat) => ({
          id: chat.id._serialized,
          name: chat.name || 'Unknown',
        }));
      return successResponse(c, groups);
    } else {
      const socket = sock as WASocket;
      const groupsMap = await socket.groupFetchAllParticipating();
      const groups = Object.entries(groupsMap).map(([jid, meta]) => ({
        id: jid,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: (meta as any)?.subject ?? 'Unknown',
      }));
      return successResponse(c, groups);
    }
  } catch (err) {
    console.error('Failed to fetch groups for instances:', err);
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Failed to fetch groups',
      500
    );
  }
});

instancesRoutes.post('/:id/disconnect', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  await disconnectInstance(id);
  const [updated] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  return successResponse(c, updated!);
});

instancesRoutes.post('/:id/logout', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  try {
    await logoutInstance(id);
    const [updated] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
    return successResponse(c, updated!);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Logout failed',
      500
    );
  }
});

instancesRoutes.post('/:id/clear-cache', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  try {
    await logoutInstance(id);
    const [updated] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
    return successResponse(c, updated!);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Clear cache failed',
      500
    );
  }
});

instancesRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  await disconnectInstance(id);
  await db.delete(instances).where(eq(instances.id, id));
  return successResponse(c, { id });
});
