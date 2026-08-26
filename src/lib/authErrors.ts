// Maps raw Supabase / browser auth errors into safe, user-facing messages.
// Full technical details are logged separately (client console) and are never
// shown to end users directly.
export function normalizeAuthError(err: unknown): string {
  const raw = err as any;
  const msg = String(raw?.message || raw?.error_description || err || '');
  const lower = msg.toLowerCase();

  // Confirmed auth failures from GoTrue (status 400 + invalid_credentials).
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('invalid email') ||
    (lower.includes('password') && (lower.includes('incorrect') || lower.includes('invalid')))
  ) {
    return 'Invalid email or password.';
  }

  // Browser-level network failures (the old raw "Failed to fetch").
  if (
    /failed to fetch|network error|networkerror|load failed|failed to load|fetch failed|enetdown|typedarray|network request failed/i.test(
      lower
    )
  ) {
    return 'Unable to connect to the server. Check your connection and try again.';
  }

  if (lower.includes('not confirmed') || lower.includes('email not verified')) {
    return 'Please confirm your email address before signing in.';
  }

  if (raw?.status === 429 || lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please try again later.';
  }

  if (raw?.status === 422) {
    return 'Password does not meet the requirements.';
  }

  // Configuration sanity — prefer telling the admin over a cryptic network error.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return 'Authentication is not configured. Contact your administrator.';
  }

  return msg || 'Sign in failed. Please try again.';
}
