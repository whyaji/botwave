/**
 * Shared list-query utilities for "find all" endpoints.
 * Aligns with frontend: pagination-search.ts and usePaginationSearch.ts
 *
 * Query params: page, limit, search, sort_by, order, filter
 * Filter string format: "field1:value1;field2:value2" (values may be URI-encoded)
 *
 * Reuse in other modules:
 * 1. Route: const listParams = parseListQuery(c.req.query()); const options = toFindAllOptions(listParams);
 * 2. Repository: findAll(options: FindAllOptions) => Promise<FindAllResult<T>>
 * 3. Response: successResponse(c, data, 200, createPaginationMeta(page, limit, total));
 */

const FILTER_PAIR_SEP = ';';
const FILTER_KEY_VALUE_SEP = ':';

/** Parsed list query from request (matches frontend DefaultPaginationSearch) */
export interface ListQueryParams {
  page: number;
  limit: number;
  search: string | undefined;
  sort_by: string;
  order: 'asc' | 'desc';
  filter: string | undefined;
}

/** Default values when not provided */
export const DEFAULT_LIST_QUERY: ListQueryParams = {
  page: 1,
  limit: 10,
  search: undefined,
  sort_by: 'id',
  order: 'desc',
  filter: undefined,
};

const MIN_PAGE = 1;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

/**
 * Parse list query from a query record (e.g. c.req.query()).
 * Validates and clamps page/limit; defaults sort_by and order.
 */
export function parseListQuery(query: Record<string, string | undefined>): ListQueryParams {
  const page = Math.max(
    MIN_PAGE,
    parseInt(String(query.page ?? DEFAULT_LIST_QUERY.page), 10) || MIN_PAGE
  );
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      MIN_LIMIT,
      parseInt(String(query.limit ?? DEFAULT_LIST_QUERY.limit), 10) || DEFAULT_LIST_QUERY.limit
    )
  );
  const search = query.search?.trim() || undefined;
  const sort_by = (query.sort_by?.trim() || DEFAULT_LIST_QUERY.sort_by).toLowerCase();
  const rawOrder = (query.order?.trim() || DEFAULT_LIST_QUERY.order).toLowerCase();
  const order = rawOrder === 'asc' ? 'asc' : 'desc';
  const filter = query.filter?.trim() || undefined;

  return { page, limit, search, sort_by, order, filter };
}

/**
 * Parse URL filter string "field1:value1;field2:value2" into Record.
 * Matches frontend parseFilterString: values decoded with decodeURIComponent.
 */
export function parseFilterString(filter?: string): Record<string, string> {
  if (!filter || filter.trim() === '') return {};
  const out: Record<string, string> = {};
  const pairs = filter.split(FILTER_PAIR_SEP);
  for (const pair of pairs) {
    const sepIndex = pair.indexOf(FILTER_KEY_VALUE_SEP);
    if (sepIndex === -1) continue;
    const key = pair.slice(0, sepIndex).trim();
    const value = pair.slice(sepIndex + 1).trim();
    if (!key) continue;
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/** Options for repository findAll: pagination + sort + filter (parsed) */
export interface FindAllOptions {
  page: number;
  limit: number;
  search?: string;
  sort_by: string;
  order: 'asc' | 'desc';
  /** Parsed filter key-value (e.g. from parseFilterString) */
  filter?: Record<string, string>;
}

/**
 * Build FindAllOptions from ListQueryParams (parse filter string into object).
 */
export function toFindAllOptions(params: ListQueryParams): FindAllOptions {
  return {
    page: params.page,
    limit: params.limit,
    search: params.search,
    sort_by: params.sort_by,
    order: params.order,
    filter: params.filter ? parseFilterString(params.filter) : undefined,
  };
}
