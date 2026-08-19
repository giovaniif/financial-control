import { vi } from 'vitest';

/** What a stubbed route was asked for, when one answer per call is not enough. */
export interface StubRequest {
  method: string;
  /** The parsed JSON body, or undefined for a read. */
  body: unknown;
}

/**
 * A route may answer with a fixed body, or with a function when successive
 * calls must differ — a conversation asks the same path once per turn and
 * gets a different answer every time.
 */
export type StubReply = (request: StubRequest) => unknown;

export type StubRoute = StubReply | object | string | number | boolean | null;

/**
 * Answers per endpoint, because a screen fetches more than its own data — the
 * shell always asks for accounts and the cycle window alongside it. A stub
 * that returns one body for every URL makes a page look broken for the wrong
 * reason.
 */
export function stubApi(routes: Record<string, StubRoute>): void {
  const defaults: Record<string, StubRoute> = {
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
      assistantAvailable: true,
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
    vi.fn((input: string, init?: RequestInit) => {
      const { pathname } = new URL(input, 'http://test');
      const route = table[pathname];
      // `object` covers functions as well, so narrowing by typeof widens the
      // signature away rather than picking the responder out of the union.
      const answer: unknown =
        typeof route === 'function'
          ? (route as StubReply)({
              method: init?.method ?? 'GET',
              body: read(init?.body),
            })
          : route;

      // A route may answer with a whole Response when the status is the point.
      if (answer instanceof Response) {
        return Promise.resolve(answer);
      }

      return Promise.resolve(
        new Response(JSON.stringify(answer ?? {}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
}

function read(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
