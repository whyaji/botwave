import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '@/src/db/connection';
import { jobs } from '@/src/db/schema/schema';

import { authMiddleware } from '../common/middleware/auth.middleware';
import { createPaginationMeta } from '../common/utils/response';
import { errorResponse, successResponse } from '../common/utils/response';

export const jobsRoutes = new Hono();

jobsRoutes.use('*', authMiddleware);

jobsRoutes.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '10', 10)));
  const type = c.req.query('type');
  const status = c.req.query('status');
  const offset = (page - 1) * limit;

  const conditions = [];
  if (type) conditions.push(eq(jobs.type, type));
  if (status)
    conditions.push(
      eq(jobs.status, status as 'Pending' | 'Processing' | 'Completed' | 'Failed' | 'Cancelled')
    );

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [list, countResult] = await Promise.all([
    db.select().from(jobs).where(where).limit(limit).offset(offset).orderBy(desc(jobs.createdAt)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return c.json({
    success: true,
    data: list,
    meta: createPaginationMeta(page, limit, total),
  });
});

jobsRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!row) {
    return errorResponse(c, 'NOT_FOUND', 'Job not found', 404);
  }
  return successResponse(c, row);
});
