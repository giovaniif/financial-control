import { apiUrl } from '../config/env.js';

const NO_CONTENT = 204;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message?: string,
  ) {
    super(message ?? `${path} responded ${String(status)}`);
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
  // Only a body the caller serialised is JSON; a bodiless read must not
  // claim a content type it does not send.
  if (typeof init?.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });

  if (!response.ok) {
    throw new ApiError(response.status, path, await explanationOf(response));
  }

  // A write answers 204 with no body. Parsing that as JSON throws, which would
  // reject a mutation whose write actually succeeded — leaving `onSuccess` to
  // never run and the screen never to refresh.
  if (response.status === NO_CONTENT) {
    return null as T;
  }

  return (await response.json()) as T;
}

/**
 * The domain refuses things for reasons worth reading — a cycle that is not
 * settled, an anchor change that would orphan entries. Every route answers
 * with `{ error }`, so the message reaches the user instead of a status code.
 */
export async function explanationOf(
  response: Response,
): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();

    return typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
      ? body.error
      : undefined;
  } catch {
    return undefined;
  }
}
