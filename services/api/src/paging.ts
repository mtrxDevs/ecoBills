// Shared pagination envelope. New list endpoints return
// { data, page, pageSize, total, totalPages } — never an unbounded array.
export function pageEnvelope<T>(rows: T[], total: number, page: number, pageSize: number) {
  return {
    data: rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}
