import type { AnyColumn } from 'drizzle-orm';

/**
 * Sort options for list/findAll queries.
 * sortBy: column key (must be one of the allowed keys in the repository's column map).
 * sortOrder: 'asc' | 'desc'.
 */
export interface SortOptions {
  sort_by?: string;
  order?: 'asc' | 'desc';
}

/** Default sort column when none specified */
export const DEFAULT_SORT_BY = 'created_at';

/** Default sort direction */
export const DEFAULT_SORT_ORDER = 'desc' as const;

/**
 * Column map type: sort key -> function that returns the table column.
 * Used so each repository can define its allowed sortable columns.
 */
export type OrderByColumnMap<TTable> = Record<string, (table: TTable) => AnyColumn>;

/**
 * Builds a Drizzle orderBy callback for use in findMany/query.
 * Use with: db.query.*.findMany({ orderBy: buildOrderBy(table, defaultSortKey, options) }).
 *
 * @param table - Map of sort key to (table) => column. Only keys in this map are allowed.
 * @param defaultSortKey - Key to use when sortBy is missing or not in columnMap
 * @param options - Optional sortBy and sortOrder (e.g. from pagination)
 * @returns orderBy callback (table, { asc, desc }) => [asc(col)] | [desc(col)]
 */
/**
 * Return type is intentionally loose so the callback is assignable to Drizzle's
 * orderBy in findMany (which expects a specific fields/operators signature).
 */

export function buildOrderBy<TTable>(
  table: TTable,
  defaultSortKey: keyof TTable,
  options?: SortOptions
): (
  table: TTable,
  helpers: {
    asc: (c: AnyColumn) => OrderByColumnMap<TTable>;
    desc: (c: AnyColumn) => OrderByColumnMap<TTable>;
  }
) => OrderByColumnMap<TTable>[] {
  let sortBy: keyof TTable;
  try {
    sortBy = (
      options?.sort_by && table[options.sort_by as keyof TTable] ? options.sort_by : defaultSortKey
    ) as keyof TTable;
  } catch {
    sortBy = defaultSortKey;
  }
  const sortOrder = options?.order === 'asc' ? 'asc' : 'desc';
  return (
    table: TTable,
    {
      asc,
      desc,
    }: {
      asc: (c: AnyColumn) => OrderByColumnMap<TTable>;
      desc: (c: AnyColumn) => OrderByColumnMap<TTable>;
    }
  ) => {
    const col = table[sortBy];
    return sortOrder === 'asc' ? [asc(col as AnyColumn)] : [desc(col as AnyColumn)];
  };
}
