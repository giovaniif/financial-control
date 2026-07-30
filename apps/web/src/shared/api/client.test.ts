import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from './client.js';

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes the path with the API base URL', async () => {
    const fetchMock = stubFetch(Response.json({ status: 'ok' }));

    await api('/health');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/health');
  });

  it('returns the parsed body', async () => {
    stubFetch(Response.json({ status: 'ok', uptimeSeconds: 42 }));

    await expect(api('/health')).resolves.toEqual({
      status: 'ok',
      uptimeSeconds: 42,
    });
  });

  it('asks for JSON', async () => {
    const fetchMock = stubFetch(Response.json({}));

    await api('/health');

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('sets a JSON content type only when there is a body', async () => {
    const fetchMock = stubFetch(Response.json({}));

    await api('/health', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('throws an ApiError carrying the status when the response is not ok', async () => {
    stubFetch(new Response('unavailable', { status: 503 }));

    await expect(api('/health')).rejects.toThrow(ApiError);
    await expect(api('/health')).rejects.toMatchObject({ status: 503 });
  });
});
