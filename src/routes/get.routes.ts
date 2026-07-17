import type { WASocket } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { Chat, Client } from 'whatsapp-web.js';

import { db } from '@/src/db/connection';
import { instances } from '@/src/db/schema/schema';
import { getSocket } from '@/src/services/wa/instance-manager';
import { getWebjsClient } from '@/src/services/wa/webjs-manager';

import { apiKeyAuthMiddleware } from '../common/middleware/api-key-auth.middleware';
import { errorResponse, successResponse } from '../common/utils/response';

export const getRoutes = new Hono();

getRoutes.use('*', apiKeyAuthMiddleware);

getRoutes.get('/groups', async (c) => {
  const { instanceId } = c.get('jwtPayload') as { instanceId: number; appId: number };
  const [row] = await db.select().from(instances).where(eq(instances.id, instanceId)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  if (row.status !== 'connected') {
    return errorResponse(c, 'VALIDATION_ERROR', 'Instance must be connected', 400);
  }
  const isWebjs = row.mode === 'webjs';
  const sock = isWebjs ? getWebjsClient(instanceId) : getSocket(instanceId);
  if (!sock) {
    await db
      .update(instances)
      .set({ status: 'disconnected', updatedAt: new Date() })
      .where(eq(instances.id, instanceId));
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
    console.error('Failed to fetch groups for get.routes:', err);
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Failed to fetch groups',
      500
    );
  }
});
