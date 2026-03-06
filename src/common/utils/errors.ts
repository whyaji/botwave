/**
 * Base error class for application errors
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super('FORBIDDEN', message, 403);
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

/**
 * Conflict error (duplicate, etc.)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
  }
}

/**
 * Duplicate reflas error
 */
export class DuplicateReflasError extends ConflictError {
  constructor(noReflas: string, existingReflas?: unknown) {
    super(`No Reflas ${noReflas} sudah ada di sistem`, {
      existingReflas,
    });
    this.code = 'DUPLICATE_REFLAS';
  }
}

/**
 * Invalid credentials error
 */
export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid username or password') {
    super('INVALID_CREDENTIALS', message, 401);
  }
}

/**
 * Token expired error
 */
export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token has expired') {
    super('TOKEN_EXPIRED', message, 401);
  }
}

/**
 * Internal server error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super('INTERNAL_SERVER_ERROR', message, 500, details);
  }
}

/**
 * Role not found error
 */
export class RoleNotFoundError extends NotFoundError {
  constructor(roleId?: string) {
    super(`Role${roleId ? ` with ID ${roleId}` : ''} not found`);
    this.code = 'ROLE_NOT_FOUND';
  }
}

/**
 * Permission not found error
 */
export class PermissionNotFoundError extends NotFoundError {
  constructor(permissionId?: string) {
    super(`Permission${permissionId ? ` with ID ${permissionId}` : ''} not found`);
    this.code = 'PERMISSION_NOT_FOUND';
  }
}

/**
 * System role cannot be deleted error
 */
export class SystemRoleCannotBeDeletedError extends AppError {
  constructor(roleSlug?: string) {
    super(
      'SYSTEM_ROLE_CANNOT_BE_DELETED',
      `System role${roleSlug ? ` "${roleSlug}"` : ''} cannot be deleted`,
      400
    );
  }
}

/**
 * System role cannot be modified error
 */
export class SystemRoleCannotBeModifiedError extends AppError {
  constructor(roleSlug?: string) {
    super(
      'SYSTEM_ROLE_CANNOT_BE_MODIFIED',
      `System role${roleSlug ? ` "${roleSlug}"` : ''} cannot be modified`,
      400
    );
  }
}

/**
 * Database error
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', details?: unknown) {
    super('DATABASE_ERROR', message, 500, details);
  }
}

/**
 * Business rule violation error
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown) {
    super('BUSINESS_RULE_VIOLATION', message, 400, details);
  }
}
