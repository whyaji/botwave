import { Context, Next } from 'hono';

import { logger } from '../utils/logger';

/**
 * Request logging middleware
 * Logs all incoming requests with method, path, and response time
 */
export async function loggingMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const userAgent = c.req.header('user-agent');
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

  // ✅ Skip logging for health check endpoint (prevents log flooding)
  const shouldLog = path !== '/health';

  if (shouldLog) {
    // Log request
    logger.info(
      {
        method,
        path,
        ip,
        userAgent,
      },
      `→ ${method} ${path}`
    );
  }

  await next();

  // Calculate response time
  const responseTime = Date.now() - start;
  const status = c.res.status;

  // Get error information from context if available
  const errorInfo = c.get('errorInfo') as
    | { code: string; message: string; status: number; details?: unknown }
    | undefined;

  // Prepare log data
  const logData: Record<string, unknown> = {
    method,
    path,
    status,
    responseTime: `${responseTime}ms`,
    ip,
  };

  // Add error information if status indicates an error
  if (status >= 400) {
    if (errorInfo) {
      logData.errorCode = errorInfo.code;
      logData.errorMessage = errorInfo.message;
      if (errorInfo.details) {
        logData.errorDetails = errorInfo.details;
      }
    } else {
      // If no error info in context, try to get it from response body
      // This handles cases where error might not have been set in context
      logData.errorMessage = 'Error occurred but details not available';
    }
  }

  // ✅ Skip logging for health check endpoint (prevents log flooding)
  if (!shouldLog) {
    return;
  }

  // Log response with error details if applicable
  if (status >= 400) {
    const errorMsg = errorInfo ? `${errorInfo.code}: ${errorInfo.message}` : 'Unknown error';
    logger.warn(logData, `← ${method} ${path} ${status} (${responseTime}ms) - ${errorMsg}`);
  } else {
    logger.info(logData, `← ${method} ${path} ${status} (${responseTime}ms)`);
  }
}
