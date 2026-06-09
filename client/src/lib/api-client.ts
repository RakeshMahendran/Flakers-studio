/**
 * API Client utility for making authenticated requests
 *
 * All wrappers detect a 401 response and bounce the user to
 * `/login?session_expired=1`, clearing the stale `localStorage.user` first.
 * The bounce uses `window.location.href` (not next/router) because the
 * api-client is consumable from non-component code (event handlers, SSE
 * processors, route handlers, etc.).
 *
 * Callers still receive the Response so they don't crash mid-flow, but the
 * user will have already navigated away by the time their error path renders.
 */

export interface ApiClientOptions extends RequestInit {
  token?: string;
}

/**
 * Handle a 401 by clearing local auth state and redirecting to /login with
 * the `session_expired=1` query so the login page can show a friendly notice.
 *
 * Guarded so it only runs in the browser and only fires the redirect once
 * per page lifetime (multiple in-flight 401s would otherwise stack history
 * entries and cancel each other).
 */
let didHandleUnauthorized = false;

function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  if (didHandleUnauthorized) return;

  didHandleUnauthorized = true;

  try {
    window.localStorage.removeItem("user");
  } catch {
    // localStorage can throw in private mode / restricted contexts; swallow
    // and continue with the redirect so the user still ends up at /login.
  }

  // Avoid bouncing if the user is already on the login page (e.g. a stale
  // call from a background component fires after the redirect already
  // landed). Without this we'd re-trigger redirect on the login page itself.
  const onLogin = window.location.pathname === "/login";
  if (onLogin) return;

  window.location.href = "/login?session_expired=1";
}

/**
 * Make an authenticated API request.
 *
 * Detects 401 responses and triggers a session-expired redirect before
 * returning the Response to the caller.
 */
export async function apiClient(
  url: string,
  options: ApiClientOptions = {}
): Promise<Response> {
  const { token, headers = {}, ...restOptions } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers as Record<string, string>,
  };

  // Add authorization header if token is provided
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...restOptions,
    headers: requestHeaders,
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  return response;
}

/**
 * Lower-level fetch wrapper for callers that need full control over headers
 * (e.g. SSE streams that can't use the default JSON content-type, or
 * pre-built request bodies). Still applies the same 401 redirect behavior
 * as `apiClient`.
 *
 * If `token` is provided, it is attached as `Authorization: Bearer <token>`
 * unless an Authorization header is already set on `init`.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
  token?: string
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    handleUnauthorized();
  }

  return response;
}

/**
 * Make an authenticated GET request
 */
export async function apiGet(url: string, token?: string): Promise<Response> {
  return apiClient(url, { method: 'GET', token });
}

/**
 * Make an authenticated POST request
 */
export async function apiPost(
  url: string,
  data?: any,
  token?: string
): Promise<Response> {
  return apiClient(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
    token,
  });
}

/**
 * Make an authenticated PUT request
 */
export async function apiPut(
  url: string,
  data?: any,
  token?: string
): Promise<Response> {
  return apiClient(url, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
    token,
  });
}

/**
 * Make an authenticated PATCH request
 */
export async function apiPatch(
  url: string,
  data?: any,
  token?: string
): Promise<Response> {
  return apiClient(url, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
    token,
  });
}

/**
 * Make an authenticated DELETE request
 */
export async function apiDelete(url: string, token?: string): Promise<Response> {
  return apiClient(url, { method: 'DELETE', token });
}
