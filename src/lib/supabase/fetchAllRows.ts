/**
 * Supabase/PostgREST silently caps every un-paginated select at 1000 rows
 * (`max-rows`), so `await supabase.from('leads').select(...)` returns the first
 * 1000 rows and no error. Anything that counts or aggregates rows in code must
 * page through the table instead.
 *
 * `build` must return a FRESH query for each page (query builders are mutated by
 * `.range()`) and should include a stable `.order(...)` so pages never overlap.
 *
 *   const res = await fetchAllRows((from, to) =>
 *     supabase.from('leads').select('crm_status').order('id').range(from, to));
 */
export async function fetchAllRows<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  maxRows = 100000
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: all, error: null };
}
