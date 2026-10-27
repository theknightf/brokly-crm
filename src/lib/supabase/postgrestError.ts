export type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export interface DetailedError extends Error {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

/**
 * Format a rich PostgREST error string exposing code, message, details, and hint.
 */
export function describePostgrestError(
  error: unknown,
  fallback = 'Failed to load leads'
): string {
  if (!error) return fallback;
  const e = (typeof error === 'object' ? error : { message: String(error) }) as PostgrestErrorLike;
  const parts: string[] = [];

  const mainMsg = e.message && e.message !== fallback ? e.message : fallback;
  parts.push(mainMsg);

  if (e.code) parts.push(`code: ${e.code}`);
  if (e.details) parts.push(`details: ${e.details}`);
  if (e.hint) parts.push(`hint: ${e.hint}`);

  return parts.join(' — ');
}

/**
 * Log every Supabase/PostgREST field so 400/PGRST responses are diagnosable.
 */
export function logPostgrestError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const e = (error || {}) as PostgrestErrorLike;
  console.error(
    `[${context}] Supabase/PostgREST error:`,
    {
      code: e.code ?? null,
      message: e.message ?? String(error ?? ''),
      details: e.details ?? null,
      hint: e.hint ?? null,
      ...extra,
    },
    error
  );
}

/**
 * Wrap a PostgREST failure in an Error that carries code, details, and hint.
 */
export function toPostgrestError(
  error: unknown,
  fallback = 'Failed to load leads'
): DetailedError {
  const e = (typeof error === 'object' ? error : { message: String(error) }) as PostgrestErrorLike;
  const desc = describePostgrestError(error, fallback);
  const err = new Error(desc) as DetailedError;
  err.code = e.code ?? null;
  err.details = e.details ?? null;
  err.hint = e.hint ?? null;
  return err;
}
