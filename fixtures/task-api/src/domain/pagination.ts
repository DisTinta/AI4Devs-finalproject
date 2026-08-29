/**
 * A single page of results plus the metadata a client needs to request the next
 * one. Kept generic so both the repository and the service speak the same shape.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function buildPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
