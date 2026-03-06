import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ContentfulStatusCode } from 'hono/utils/http-status';

import { AppError, DatabaseError, InternalServerError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { errorResponse } from '../utils/response';

/**
 * Error handling middleware
 * Catches all errors and returns standardized error responses
 */
export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    // Determine error details
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let errorMessage = 'An unexpected error occurred';
    let statusCode: ContentfulStatusCode = 500;
    let errorDetails: unknown = undefined;

    // Handle Hono HTTPException
    if (error instanceof HTTPException) {
      errorCode = 'HTTP_ERROR';
      errorMessage = error.message;
      statusCode = error.status;
    }
    // Handle ValidationError (Zod errors, etc.) - check before AppError
    else if (error instanceof ValidationError) {
      errorCode = error.code;
      errorMessage = error.message;
      statusCode = 400;
      errorDetails = error.details;
    }
    // Handle database errors - check before AppError
    else if (error instanceof DatabaseError) {
      errorCode = error.code;
      errorMessage = error.message;
      statusCode = 500;
      errorDetails = error.details;
    }
    // Handle custom AppError (base class - check last)
    else if (error instanceof AppError) {
      errorCode = error.code;
      errorMessage = error.message;
      statusCode = error.statusCode as ContentfulStatusCode;
      errorDetails = error.details;
    }
    // Handle unknown errors
    else {
      const internalError = new InternalServerError(
        'An unexpected error occurred',
        process.env.NODE_ENV === 'development' ? { originalError: String(error) } : undefined
      );
      errorCode = internalError.code;
      errorMessage = internalError.message;
      statusCode = 500;
      errorDetails = internalError.details;
    }

    // Store error information in context for logging middleware
    // (errorResponse will also set this, but we set it here too for consistency)
    c.set('errorInfo', {
      code: errorCode,
      message: errorMessage,
      status: statusCode,
      details: errorDetails,
    });

    // Log the error
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        path: c.req.path,
        method: c.req.method,
        errorCode,
        errorMessage,
      },
      'Request error'
    );

    // Return error response (this will also set errorInfo in context via errorResponse)
    return errorResponse(c, errorCode, errorMessage, statusCode, errorDetails);
  }
}
