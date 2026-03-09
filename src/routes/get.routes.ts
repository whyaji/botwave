import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '@/src/db/connection';
import { instances } from '@/src/db/schema/schema';
import { getSocket } from '@/src/services/wa/instance-manager';

import { apiKeyAuthMiddleware } from '../common/middleware/api-key-auth.middleware';
import { errorResponse, successResponse } from '../common/utils/response';

export const getRoutes = new Hono();

getRoutes.use('*', apiKeyAuthMiddleware);

getRoutes.get('/groups', async (c) => {
  const { instanceId } = c.get('jwtPayload') as { instanceId: number; appId: number };
  const [row] = await db
    .select()
    .from(instances)
    .where(eq(instances.id, instanceId))
    .limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Instance not found', 404);
  }
  if (row.status !== 'connected') {
    return errorResponse(c, 'VALIDATION_ERROR', 'Instance must be connected', 400);
  }
  const sock = getSocket(instanceId);
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
    const groupsMap = await sock.groupFetchAllParticipating();
    const groups = Object.entries(groupsMap).map(([jid, meta]) => ({
      id: jid,
      name: meta?.subject ?? 'Unknown',
    }));
    return successResponse(c, groups);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Failed to fetch groups',
      500
    );
  }
});
