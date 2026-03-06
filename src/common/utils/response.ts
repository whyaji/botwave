import { Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';

import { ApiErrorResponse, ApiResponse, PaginationMeta } from '../types/api';

/**
 * Create a success response
 */
export function successResponse<T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200,
  meta?: PaginationMeta
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };

  return c.json(response, status);
}

/**
 * Create an error response
 */
export function errorResponse(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
  details?: unknown
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };

  // Store error information in context for logging middleware
  c.set('errorInfo', {
    code,
    message,
    status,
    details,
  });

  return c.json(response, status);
}

/**
 * Create a pagination meta object
 */
export function createPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
