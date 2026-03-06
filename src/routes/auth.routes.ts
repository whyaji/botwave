import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import env from '@/src/config/env';
import { db } from '@/src/db/connection';
import { users } from '@/src/db/schema/schema';
import { jwtService } from '@/src/modules/auth/infrastructure/jwt/jwt.service';
import { passwordService } from '@/src/modules/auth/infrastructure/password/password.service';

import { authMiddleware } from '../common/middleware/auth.middleware';
import { errorResponse, successResponse } from '../common/utils/response';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
  const parsed = loginBodySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.isActive) {
    return errorResponse(c, 'UNAUTHORIZED', 'Invalid email or password', 401);
  }

  const valid = await passwordService.verifyPassword(password, user.passwordHash);
  if (!valid) {
    return errorResponse(c, 'UNAUTHORIZED', 'Invalid email or password', 401);
  }

  const tokenId = crypto.randomUUID();
  const accessToken = await jwtService.generateAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await jwtService.generateRefreshToken(user.id, tokenId);
  const expiresIn = parseInt(env.JWT_EXPS, 10) || 3600;

  return successResponse(c, {
    accessToken,
    refreshToken,
    expiresIn,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

authRoutes.post('/refresh', async (c) => {
  const parsed = refreshBodySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Invalid body', 400, parsed.error.flatten());
  }

  try {
    const payload = await jwtService.verifyRefreshToken(parsed.data.refreshToken);
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !user.isActive) {
      return errorResponse(c, 'UNAUTHORIZED', 'User not found or inactive', 401);
    }

    const accessToken = await jwtService.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await jwtService.generateRefreshToken(user.id, crypto.randomUUID());
    const expiresIn = parseInt(env.JWT_EXPS, 10) || 3600;

    return successResponse(c, {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch {
    return errorResponse(c, 'UNAUTHORIZED', 'Invalid or expired refresh token', 401);
  }
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = (c.get('jwtPayload') as { sub: number }).sub;
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
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    return errorResponse(c, 'NOT_FOUND', 'User not found', 404);
  }
  return successResponse(c, user);
});
