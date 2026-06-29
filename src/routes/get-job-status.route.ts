import { and, eq, inArray } from 'drizzle-orm';
import { Context } from 'hono';
import { Hono } from 'hono';

import { db } from '@/src/db/connection';
import { jobs } from '@/src/db/schema/schema';

import { apiKeyAuthMiddleware } from '../common/middleware/api-key-auth.middleware';
import { errorResponse, successResponse } from '../common/utils/response';

export const getJobStatusRoutes = new Hono();

getJobStatusRoutes.use('*', apiKeyAuthMiddleware);

function parseIds(input: unknown): number[] {
  if (typeof input === 'number') {
    return [input];
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }
  if (Array.isArray(input)) {
    return input.flatMap((item) => parseIds(item));
  }
  return [];
}

async function handleGetJobStatus(c: Context, idsInput: unknown) {
  const { appId } = c.get('jwtPayload') as { appId: number };
  const parsedIds = parseIds(idsInput);

  if (parsedIds.length === 0) {
    return errorResponse(c, 'VALIDATION_ERROR', 'No valid job IDs provided', 400);
  }

  // Limit to 100 job IDs per request to avoid heavy queries
  if (parsedIds.length > 100) {
    return errorResponse(c, 'VALIDATION_ERROR', 'Maximum 100 job IDs allowed per request', 400);
  }

  try {
    const result = await db
      .select({
        id: jobs.id,
        type: jobs.type,
        status: jobs.status,
        result: jobs.result,
        attempts: jobs.attempts,
        maxAttempts: jobs.maxAttempts,
        lastError: jobs.lastError,
        startedAt: jobs.startedAt,
        completedAt: jobs.completedAt,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.createdBy, appId), inArray(jobs.id, parsedIds)));

    return successResponse(c, result);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Failed to query job status',
      500
    );
  }
}

async function handleGetJobStatusSummary(c: Context, idsInput: unknown) {
  const { appId } = c.get('jwtPayload') as { appId: number };
  const parsedIds = parseIds(idsInput);

  if (parsedIds.length === 0) {
    return errorResponse(c, 'VALIDATION_ERROR', 'No valid job IDs provided', 400);
  }

  try {
    const result = await db
      .select({
        id: jobs.id,
        status: jobs.status,
      })
      .from(jobs)
      .where(and(eq(jobs.createdBy, appId), inArray(jobs.id, parsedIds)));

    const grouped: Record<string, number[]> = {
      Pending: [],
      Processing: [],
      Completed: [],
      Failed: [],
      Cancelled: [],
    };

    for (const row of result) {
      if (grouped[row.status] !== undefined) {
        grouped[row.status].push(row.id);
      }
    }

    return successResponse(c, grouped);
  } catch (err) {
    return errorResponse(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Failed to query job status summary',
      500
    );
  }
}

// Support GET request (from query parameters: ?ids=1,2,3 or ?id=1&id=2)
getJobStatusRoutes.get('/', async (c) => {
  const queries = c.req.queries();
  const idsParam = queries['ids'] || queries['id'] || c.req.query('ids') || c.req.query('id');
  return handleGetJobStatus(c, idsParam);
});

// Support POST request (from body: { "ids": [1, 2, 3] })
getJobStatusRoutes.post('/', async (c) => {
  let body: Record<string, unknown> | null = null;
  try {
    body = await c.req.json();
  } catch {
    try {
      const parsedBody = await c.req.parseBody();
      body = parsedBody as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const idsInput = body?.ids !== undefined ? body.ids : body?.id;
  return handleGetJobStatus(c, idsInput);
});

// Support POST summary request (from body: { "ids": [1, 2, 3] })
getJobStatusRoutes.post('/summary', async (c) => {
  let body: Record<string, unknown> | null = null;
  try {
    body = await c.req.json();
  } catch {
    try {
      const parsedBody = await c.req.parseBody();
      body = parsedBody as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const idsInput = body?.ids !== undefined ? body.ids : body?.id;
  return handleGetJobStatusSummary(c, idsInput);
});

// Support GET summary request (from query parameters: ?ids=1,2,3)
getJobStatusRoutes.get('/summary', async (c) => {
  const queries = c.req.queries();
  const idsParam = queries['ids'] || queries['id'] || c.req.query('ids') || c.req.query('id');
  return handleGetJobStatusSummary(c, idsParam);
});
