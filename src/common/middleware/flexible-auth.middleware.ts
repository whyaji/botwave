import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';

import env from '@/src/config/env';
import { jwtService } from '@/src/modules/auth/infrastructure/jwt/jwt.service';

import { errorResponse } from '../utils/response';

/**
 * Flexible authentication middleware
 * Accepts: (1) API key in X-API-Key header matching ACCESS_PRIVATE_KEY,
 *          (2) JWT in Authorization header (Bearer) or access_token cookie.
 * Attaches user information to context when JWT is used.
 */
export async function flexibleAuthMiddleware(c: Context, next: Next) {
  // First, check for API key in header (must match ACCESS_PRIVATE_KEY)
  const apiKey = c.req.header('X-API-Key');
  if (apiKey && apiKey === env.ACCESS_PRIVATE_KEY) {
    c.set('authType', 'api-key');
    await next();
    return;
  }

  let token: string | undefined;

  // Try to get token from Authorization header
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  // If not found in header, try to get from cookie
  if (!token) {
    token = getCookie(c, 'access_token');
  }

  // If no token found in either location
  if (!token) {
    return errorResponse(
      c,
      'UNAUTHORIZED',
      'Missing authorization. Provide X-API-Key header, Bearer token in Authorization header, or access_token cookie',
      401
    );
  }

  try {
    // Verify and decode token
    const payload = await jwtService.verifyAccessToken(token);

    // Attach user info to context
    c.set('userId', payload.sub);
    c.set('username', payload.username);
    c.set('roles', payload.roles);
    c.set('permissions', payload.permissions);

    await next();
  } catch (error) {
    if (error instanceof Error && error.message?.includes('expired')) {
      return errorResponse(c, 'TOKEN_EXPIRED', 'Token has expired', 401);
    }
    return errorResponse(c, 'UNAUTHORIZED', 'Invalid or expired token', 401);
  }
}
