import { vi } from 'vitest';

/**
 * Answers per endpoint, because a screen fetches more than its own data — the
 * shell always asks for accounts and the cycle window alongside it. A stub
 * that returns one body for every URL makes a page look broken for the wrong
 * reason.
 */
export function stubApi(routes: Record<string, unknown>): void {
  const defaults: Record<string, unknown> = {
    '/api/accounts': { accounts: [], total: 0 },
    '/api/buckets': [],
    '/api/cards': [],
    '/api/cycles': { estimates: 'included', cycles: [] },
    '/api/settings/anchor/resolve': { cycles: [] },
    '/api/wealth': { horizons: [], buckets: [], retirement: null },
    '/api/setup': {
      anchorConfigured: false,
      accounts: 0,
      cards: 0,
      templates: 0,
      buckets: 0,
      isPristine: true,
    },
    '/api/templates': {
      templates: [],
      summary: {
        fixedCommitment: 0,
        activeOutcomeCount: 0,
        fixedIncome: 0,
        unconfirmedEstimates: 0,
        endingWithinTwelve: [],
      },
    },
  };
  const table = { ...defaults, ...routes };

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const { pathname } = new URL(input, 'http://test');

      return Promise.resolve(
        new Response(JSON.stringify(table[pathname] ?? {}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}
