/**
 * Parse filter[field]=value from query string into Record<field, value>.
 * Used by list endpoints for per-column filtering.
 */
export function parseFilterQuery(queries: Record<string, string>): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(queries)) {
    const match = key.match(/^filter\[(.+)\]$/);
    if (match && value != null && value !== '') {
      filters[match[1]!] = value;
    }
  }
  return filters;
}
