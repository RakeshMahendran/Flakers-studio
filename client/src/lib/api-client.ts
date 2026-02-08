/**
 * API Client utility for making authenticated requests
 */

export interface ApiClientOptions extends RequestInit {
  token?: string;
}

/**
 * Make an authenticated API request
 */
export async function apiClient(
  url: string,
  options: ApiClientOptions = {}
): Promise<Response> {
  const { token, headers = {}, ...restOptions } = options;

  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Add authorization header if token is provided
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...restOptions,
    headers: requestHeaders,
  });
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
 * Make an authenticated DELETE request
 */
export async function apiDelete(url: string, token?: string): Promise<Response> {
  return apiClient(url, { method: 'DELETE', token });
}
