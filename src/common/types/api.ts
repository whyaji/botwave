/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Success API response
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/**
 * Error API response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Union type for API responses
 */
export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

/**
 * Validation error detail
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * Result shape for paginated find-all endpoints (reusable across modules)
 */
export interface FindAllResult<T> {
  data: T[];
  total: number;
}

/**
 * Common query parameters for list endpoints
 */
export interface ListQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Date range filter
 */
export interface DateRangeFilter {
  tanggalFrom?: string;
  tanggalTo?: string;
  periodeFrom?: string;
  periodeTo?: string;
}
