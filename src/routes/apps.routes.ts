import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { generateApiKey, hashApiKey } from '@/src/common/utils/api-key';
import { db } from '@/src/db/connection';
import { apps } from '@/src/db/schema/schema';

import { authMiddleware } from '../common/middleware/auth.middleware';
import { errorResponse, successResponse } from '../common/utils/response';

const createAppSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  instanceId: z.number().int().positive(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  instanceId: z.number().int().positive().optional(),
  isActive: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const appsRoutes = new Hono();

appsRoutes.use('*', authMiddleware);

appsRoutes.get('/', async (c) => {
  const list = await db
    .select({
      id: apps.id,
      appId: apps.appId,
      name: apps.name,
      description: apps.description,
      instanceId: apps.instanceId,
      isActive: apps.isActive,
      createdBy: apps.createdBy,
      createdAt: apps.createdAt,
      updatedAt: apps.updatedAt,
    })
    .from(apps)
    .orderBy(apps.createdAt);
  return successResponse(c, list);
});

appsRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db
    .select({
      id: apps.id,
      appId: apps.appId,
      name: apps.name,
      description: apps.description,
      instanceId: apps.instanceId,
      isActive: apps.isActive,
      createdBy: apps.createdBy,
      createdAt: apps.createdAt,
      updatedAt: apps.updatedAt,
    })
    .from(apps)
    .where(eq(apps.id, id))
    .limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'App not found', 404);
  }
  return successResponse(c, row);
});

appsRoutes.post('/', async (c) => {
  const parsed = createAppSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }
  const userId = (c.get('jwtPayload') as { sub: number }).sub;
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const appId = randomUUID().replace(/-/g, '').slice(0, 32);

  const [inserted] = await db
    .insert(apps)
    .values({
      appId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      instanceId: parsed.data.instanceId,
      apiKeyHash,
      isActive: 1,
      createdBy: userId,
    })
    .returning({
      id: apps.id,
      appId: apps.appId,
      name: apps.name,
      description: apps.description,
      instanceId: apps.instanceId,
      isActive: apps.isActive,
      createdAt: apps.createdAt,
      updatedAt: apps.updatedAt,
    });
  return successResponse(c, { ...inserted!, apiKey }, 201);
});

appsRoutes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const parsed = updateAppSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }
  const [existing] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
  if (!existing) {
    return errorResponse(c, 'NOT_FOUND', 'App not found', 404);
  }

  const updates: Partial<{
    name: string;
    description: string | null;
    instanceId: number;
    isActive: number;
    updatedAt: Date;
  }> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
  if (parsed.data.instanceId !== undefined) updates.instanceId = parsed.data.instanceId;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  updates.updatedAt = new Date();

  const [updated] = await db.update(apps).set(updates).where(eq(apps.id, id)).returning({
    id: apps.id,
    appId: apps.appId,
    name: apps.name,
    description: apps.description,
    instanceId: apps.instanceId,
    isActive: apps.isActive,
    createdAt: apps.createdAt,
    updatedAt: apps.updatedAt,
  });
  return successResponse(c, updated!);
});

appsRoutes.post('/:id/regenerate-api-key', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [existing] = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
  if (!existing) {
    return errorResponse(c, 'NOT_FOUND', 'App not found', 404);
  }
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  await db.update(apps).set({ apiKeyHash, updatedAt: new Date() }).where(eq(apps.id, id));
  return successResponse(c, { apiKey });
});

appsRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [deleted] = await db.delete(apps).where(eq(apps.id, id)).returning({ id: apps.id });
  if (!deleted) {
    return errorResponse(c, 'NOT_FOUND', 'App not found', 404);
  }
  return successResponse(c, { id: deleted.id });
});
