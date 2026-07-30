/**
 * Base URL every request is prefixed with.
 *
 * The default is the `/api` *path*, not an absolute URL, so the browser always
 * talks to the origin that served the app. In development Vite proxies it to
 * the API on the same host — which is what makes this work when the app is
 * opened from another machine over Tailscale, where `localhost` would resolve
 * to the wrong computer entirely.
 */
export function resolveApiUrl(configured: unknown): string {
  if (typeof configured !== 'string' || configured.trim() === '') return '/api';

  return configured.trim().replace(/\/+$/, '');
}

export const apiUrl = resolveApiUrl(import.meta.env['VITE_API_URL']);
