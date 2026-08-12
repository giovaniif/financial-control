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

  /**
   * Settling answers 204 with no body, and parsing that as JSON throws. The
   * mutation then rejects even though the write succeeded, so `onSuccess`
   * never invalidates anything and the screen keeps the stale figures — a
   * write that visibly does nothing.
   */
  it('resolves to null on a 204 rather than trying to parse it', async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(api('/cycles/2026-09/entries/e1/settle')).resolves.toBeNull();
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

  /**
   * The domain refuses things for reasons the user needs to read — a cycle
   * that is not settled, an anchor change that would orphan entries. A bare
   * status code is not an explanation.
   */
  it('carries the server\u2019s explanation on a failure', async () => {
    stubFetch(
      Response.json({ error: 'Two entries are orphaned.' }, { status: 409 }),
    );

    await expect(api('/settings/anchor')).rejects.toThrow(
      'Two entries are orphaned.',
    );
  });

  it('falls back to the status when the body says nothing', async () => {
    stubFetch(new Response('', { status: 500 }));

    await expect(api('/health')).rejects.toThrow('/health responded 500');
  });

  it('still reports the status alongside the message', async () => {
    stubFetch(Response.json({ error: 'Nope.' }, { status: 409 }));

    await expect(api('/health')).rejects.toMatchObject({
      status: 409,
      path: '/health',
    });
  });
});
