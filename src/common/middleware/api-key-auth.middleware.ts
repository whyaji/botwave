import { eq } from 'drizzle-orm';
import { Context, Next } from 'hono';

import { hashApiKey } from '@/src/common/utils/api-key';
import { db } from '@/src/db/connection';
import { apps } from '@/src/db/schema/schema';

import { errorResponse } from '../utils/response';

/**
 * Middleware for send API: require x-api-key header, resolve to app, set appId and instanceId on context.
 */
export async function apiKeyAuthMiddleware(c: Context, next: Next) {
  const apiKey = c.req.header('x-api-key') || c.req.header('X-API-Key');
  if (!apiKey || !apiKey.trim()) {
    return errorResponse(c, 'UNAUTHORIZED', 'Missing x-api-key header', 401);
  }

  const hash = hashApiKey(apiKey.trim());
  const [app] = await db.select().from(apps).where(eq(apps.apiKeyHash, hash)).limit(1);

  if (!app) {
    return errorResponse(c, 'UNAUTHORIZED', 'Invalid API key', 401);
  }
  if (!app.isActive) {
    return errorResponse(c, 'FORBIDDEN', 'App is inactive', 403);
  }

  c.set('appId', app.id);
  c.set('app', app);
  c.set('instanceId', app.instanceId);
  c.set('jwtPayload', { instanceId: app.instanceId, appId: app.id });
  await next();
}
