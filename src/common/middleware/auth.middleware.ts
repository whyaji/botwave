import { Context, Next } from 'hono';

import { jwtService } from '@/src/modules/auth/infrastructure/jwt/jwt.service';

import { errorResponse } from '../utils/response';

/**
 * Authentication middleware
 * Extracts and validates JWT token from Authorization header
 * Attaches user information to context
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(c, 'UNAUTHORIZED', 'Missing or invalid authorization header', 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    // Verify and decode token
    const payload = await jwtService.verifyAccessToken(token);

    // Attach user info and project roles to context
    c.set('userId', payload.sub);
    c.set('email', payload.email);
    c.set('role', (payload as { role?: string }).role ?? '');
    c.set('jwtPayload', payload);

    await next();
  } catch (error) {
    if (error instanceof Error && error.message?.includes('expired')) {
      return errorResponse(c, 'TOKEN_EXPIRED', 'Token has expired', 401);
    }
    return errorResponse(c, 'UNAUTHORIZED', 'Invalid or expired token', 401);
  }
}

/**
 * Optional authentication middleware
 * Only validates token if present, doesn't require it
 * Useful for endpoints that work with or without authentication
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const payload = await jwtService.verifyAccessToken(token);
      c.set('userId', payload.sub);
      c.set('email', payload.email);
      c.set('role', (payload as { role?: string }).role ?? '');
      c.set('jwtPayload', payload);
    } catch {
      // Ignore errors for optional auth
    }
  }

  await next();
}

/**
 * Role-based access middleware
 * Use after authMiddleware. Restricts access to users who have at least one of the allowed roles.
 */
export function roleMiddleware(allowedRoles: string[]) {
  return async function (c: Context, next: Next) {
    const role = c.get('role') as string | undefined;
    if (!role) {
      return errorResponse(c, 'FORBIDDEN', 'Access denied', 403);
    }
    const hasRole = allowedRoles.some((r) => role === r);
    if (!hasRole) {
      return errorResponse(
        c,
        'FORBIDDEN',
        'You do not have permission to access this resource',
        403
      );
    }
    await next();
  };
}
