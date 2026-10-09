const DEFAULT_AUTH_REDIRECT = "/dashboard";
const AUTH_REDIRECT_ORIGIN = "https://engcalcs.local";

export function safeAuthRedirectUrl(
  next: string | null,
  requestUrl: string,
): URL {
  const fallback = new URL(DEFAULT_AUTH_REDIRECT, requestUrl);

  if (!next) return fallback;

  try {
    const candidate = new URL(next, requestUrl);
    if (
      candidate.origin !== fallback.origin ||
      candidate.username ||
      candidate.password
    ) {
      return fallback;
    }
    return candidate;
  } catch {
    return fallback;
  }
}

export function safeAuthRedirectPath(next: string | null): string {
  const destination = safeAuthRedirectUrl(next, AUTH_REDIRECT_ORIGIN);
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function authPageHref(page: "login" | "signup", next: string | null): string {
  const params = new URLSearchParams({ next: safeAuthRedirectPath(next) });
  return `/${page}?${params.toString()}`;
}
