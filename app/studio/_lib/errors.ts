// Shared error-message helpers for studio fetch calls.
//
// "Failed to fetch" is a browser TypeError that fires when the fetch() call
// can never reach the server at all — the dev server is not running, it is
// still compiling, or the network is down. Showing the raw TypeError text
// ("Failed to fetch") is confusing; give a clear actionable message instead.

export function friendlyFetchError(requestError: unknown, fallback: string): string {
  if (requestError instanceof Error && requestError.name === 'AbortError') {
    return 'Request cancelled. Nothing was replaced.';
  }
  const raw = requestError instanceof Error ? requestError.message : fallback;
  const isNetworkError = requestError instanceof TypeError && /fetch/i.test(raw);
  return isNetworkError
    ? 'Could not reach the server. Make sure the dev server is running (npm run dev) and try again.'
    : raw;
}
