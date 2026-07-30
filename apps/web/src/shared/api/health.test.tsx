import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHealth } from './health.js';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe('useHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the API health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ status: 'ok', uptimeSeconds: 7 })),
    );

    const { result } = renderHook(() => useHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({ status: 'ok', uptimeSeconds: 7 });
  });

  it('surfaces a failure rather than pretending the API is up', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('down', { status: 503 })),
    );

    const { result } = renderHook(() => useHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
