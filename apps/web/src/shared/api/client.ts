import { apiUrl } from '../config/env.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`${path} responded ${String(status)}`);
    this.name = 'ApiError';
  }
}

/**
 * The single door to the API. Components never call `fetch` — they go through
 * a query or a mutation, and those go through here.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body != null) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });

  if (!response.ok) throw new ApiError(response.status, path);

  return (await response.json()) as T;
}
