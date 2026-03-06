import { eq, ilike, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '@/src/db/connection';
import { users } from '@/src/db/schema/schema';
import { passwordService } from '@/src/modules/auth/infrastructure/password/password.service';

import { authMiddleware, roleMiddleware } from '../common/middleware/auth.middleware';
import { createPaginationMeta } from '../common/utils/response';
import { errorResponse, successResponse } from '../common/utils/response';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(255),
  role: z.enum(['superadmin', 'admin', 'user']),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(1).max(255).optional(),
  role: z.enum(['superadmin', 'admin', 'user']).optional(),
  isActive: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const usersRoutes = new Hono();

usersRoutes.use('*', authMiddleware);
usersRoutes.use('*', roleMiddleware(['superadmin', 'admin']));

usersRoutes.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '10', 10)));
  const search = c.req.query('search') ?? '';
  const offset = (page - 1) * limit;

  const where = search
    ? or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))
    : undefined;

  const [list, countResult] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(users.createdAt),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return c.json({
    success: true,
    data: list,
    meta: createPaginationMeta(page, limit, total),
  });
});

usersRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) {
    return errorResponse(c, 'NOT_FOUND', 'User not found', 404);
  }
  return successResponse(c, user);
});

usersRoutes.post('/', async (c) => {
  const parsed = createUserSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }
  const { email, password, name, role } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return errorResponse(c, 'CONFLICT', 'Email already registered', 409);
  }

  const passwordHash = await passwordService.hashPassword(password);
  const [inserted] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
      role,
      isActive: 1,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });
  return successResponse(c, inserted!, 201);
});

usersRoutes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const parsed = updateUserSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) {
    return errorResponse(c, 'NOT_FOUND', 'User not found', 404);
  }

  const updates: Partial<{
    email: string;
    passwordHash: string;
    name: string;
    role: 'superadmin' | 'admin' | 'user';
    isActive: number;
    updatedAt: Date;
  }> = {};
  if (parsed.data.email !== undefined) updates.email = parsed.data.email;
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.password !== undefined) {
    updates.passwordHash = await passwordService.hashPassword(parsed.data.password);
  }

  updates.updatedAt = new Date();

  if (Object.keys(updates).length === 1 && 'updatedAt' in updates) {
    return successResponse(c, {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      isActive: existing.isActive,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    });
  }

  const [updated] = await db
    .update(users)
    .set(updates as Record<string, unknown>)
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });
  return successResponse(c, updated!);
});

usersRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid id', 400);
  }
  const userId = (c.get('jwtPayload') as { sub: number }).sub;
  if (id === userId) {
    return errorResponse(c, 'FORBIDDEN', 'Cannot delete your own account', 403);
  }
  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  if (!deleted) {
    return errorResponse(c, 'NOT_FOUND', 'User not found', 404);
  }
  return successResponse(c, { id: deleted.id });
});
