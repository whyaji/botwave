import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '@/src/db/connection';
import { settings } from '@/src/db/schema/schema';

import { authMiddleware } from '../common/middleware/auth.middleware';
import { errorResponse, successResponse } from '../common/utils/response';

const updateSettingSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string(),
});

export const settingsRoutes = new Hono();

settingsRoutes.use('*', authMiddleware);

settingsRoutes.get('/', async (c) => {
  try {
    const list = await db.select().from(settings).orderBy(settings.key);
    return successResponse(c, list);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Failed to fetch settings',
      500
    );
  }
});

settingsRoutes.post('/', async (c) => {
  const parsed = updateSettingSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }

  const { key, value } = parsed.data;

  try {
    const [inserted] = await db
      .insert(settings)
      .values({
        key,
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();

    return successResponse(c, inserted!);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Failed to update setting',
      500
    );
  }
});
