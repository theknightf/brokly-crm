/**
 * Supabase/PostgREST silently caps every un-paginated select at 1000 rows
 * (`max-rows`), so `await supabase.from('leads').select(...)` returns the first
 * 1000 rows and no error. Anything that counts or aggregates rows in code must
 * page through the table instead.
 *
 * `build` must return a FRESH query for each page (query builders are mutated by
 * `.range()`) and should include a stable `.order(...)` so pages never overlap.
 * Pages after the first are requested in parallel batches, so a 5,000-row table
 * costs ~2 round trips instead of 5.
 *
 *   const res = await fetchAllRows((from, to) =>
 *     supabase.from('leads').select('crm_status').order('id').range(from, to));
 */
export async function fetchAllRows<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  maxRows = 100000,
  concurrency = 4
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  const first = await build(0, pageSize - 1);
  if (first.error) return { data: all, error: first.error };
  const firstRows = first.data || [];
  all.push(...firstRows);
  if (firstRows.length < pageSize) return { data: all, error: null };

  for (let from = pageSize; from < maxRows; from += pageSize * concurrency) {
    const starts: number[] = [];
    for (let i = 0; i < concurrency && from + i * pageSize < maxRows; i++) starts.push(from + i * pageSize);
    // .then() is invoked synchronously per page: callers may reuse one mutable query builder
    // (.range() edits it in place), so each request must start before the next range is set.
    const results = await Promise.all(
      starts.map(
        (s) =>
          new Promise<{ data: T[] | null; error: any }>((resolve, reject) => {
            build(s, s + pageSize - 1).then(resolve, reject);
          })
      )
    );
    let done = false;
    for (const r of results) {
      if (r.error) return { data: all, error: r.error };
      const rows = r.data || [];
      all.push(...rows);
      if (rows.length < pageSize) {
        done = true;
        break;
      }
    }
    if (done) break;
  }
  return { data: all, error: null };
}
