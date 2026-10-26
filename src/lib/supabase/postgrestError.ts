export type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * Log every Supabase/PostgREST field so 400/300 responses are diagnosable.
 * Keep the original error object as the last console argument for stack/devtools.
 */
export function logPostgrestError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const e = (error || {}) as PostgrestErrorLike;
  console.error(
    `[${context}] Supabase/PostgREST error`,
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
 * Human-readable message. Development gets the real PostgREST message,
 * details and hint; production avoids dumping internals into the UI.
 */
export function describePostgrestError(
  error: unknown,
  fallback: string
): string {
  const e = (error || {}) as PostgrestErrorLike;
  if (process.env.NODE_ENV !== 'production') {
    return [
      fallback,
      e.message && e.message !== fallback ? e.message : '',
      e.details ? `details: ${e.details}` : '',
      e.hint ? `hint: ${e.hint}` : '',
      e.code ? `code: ${e.code}` : '',
    ]
      .filter(Boolean)
      .join(' — ');
  }
  return `${fallback}${e.code ? ` (${e.code})` : ''}`;
}

/** Wrap a PostgREST failure in an Error that still carries its diagnostics. */
export function toPostgrestError(error: unknown, fallback: string): Error {
  const e = (error || {}) as PostgrestErrorLike;
  const wrapped = new Error(describePostgrestError(error, fallback)) as Error & {
    code?: string | null;
    details?: string | null;
    hint?: string | null;
  };
  wrapped.code = e.code ?? null;
  wrapped.details = e.details ?? null;
  wrapped.hint = e.hint ?? null;
  return wrapped;
}
