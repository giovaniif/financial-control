import type { SetupAppliedResponse, SetupTurnResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { OnboardingPage } from './onboarding-page.js';

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/onboarding', element: <OnboardingPage /> },
          { path: '/', element: <p>Main</p> },
        ],
        { initialEntries: ['/onboarding'] },
      )}
    />,
  );

const turn = (over: Partial<SetupTurnResponse> = {}): SetupTurnResponse => ({
  conversationId: 'conv-1',
  message: 'And where do you keep your money?',
  established: [],
  corrections: [],
  nextSection: 'ACCOUNTS',
  isComplete: false,
  wasRefused: false,
  ...over,
});

/** One answer per turn: the same path is asked again for every reply. */
const conversation = (...turns: SetupTurnResponse[]) => {
  let asked = 0;

  return () => {
    const answer = turns[Math.min(asked, turns.length - 1)];
    asked += 1;

    return answer;
  };
};

const applied: SetupAppliedResponse = {
  anchorDay: 5,
  shiftPolicy: 'PRECEDING',
  accounts: 2,
  templates: 4,
  cards: 1,
  buckets: 3,
};

const say = async (text: string) => {
  await userEvent.type(await screen.findByLabelText('Your answer'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
};

/** What the app actually asked the network for, in call order. */
function requests(): { url: string; method: string }[] {
  return vi.mocked(fetch).mock.calls.map(([input, init]) => ({
    url:
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    method: init?.method ?? 'GET',
  }));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the setup conversation', () => {
  it('opens by asking about the payday cycle', async () => {
    stubApi({});
    renderPage();

    expect(
      await screen.findByRole('log', { name: 'Setup conversation' }),
    ).toHaveTextContent(/paid/i);
  });

  it('answers a question and asks the next one', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({ message: 'And where do you keep your money?' }),
      ),
    });
    renderPage();

    await say('the 5th, moving back off a weekend');

    expect(
      await screen.findByText('And where do you keep your money?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('the 5th, moving back off a weekend'),
    ).toBeInTheDocument();
  });

  it('shows what the answer established, as the app writes it', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({
          established: [
            {
              section: 'FIXED_BILLS',
              summary: 'Health plan — R$ 320,00 on day 8.',
            },
          ],
        }),
      ),
    });
    renderPage();

    await say('health plan 320 on the 8th');

    expect(
      await screen.findByText('Health plan — R$ 320,00 on day 8.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Fixed bills')).toBeInTheDocument();
  });

  // The domain writes a date as an ISO day; the app shows dd/MM/yyyy.
  it('shows a date in a record the way the app writes dates', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({
          established: [
            {
              section: 'BUCKETS',
              summary:
                'Apartment — 20% each cycle toward R$ 150.000,00 by 2031-03-05, funded #1.',
            },
          ],
        }),
      ),
    });
    renderPage();

    await say('20% to the apartment, 150k by March 2031');

    expect(await screen.findByText(/05\/03\/2031/)).toBeInTheDocument();
  });

  it('shows a correction and carries the conversation on', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({
          corrections: ['Day 32 is not a day of the month.'],
          message: 'Which day did you mean?',
        }),
        turn({ message: 'Thanks — and your accounts?' }),
      ),
    });
    renderPage();

    await say('electricity 280 on the 32nd');

    expect(
      await screen.findByText('Day 32 is not a day of the month.'),
    ).toBeInTheDocument();

    await say('the 15th');

    expect(
      await screen.findByText('Thanks — and your accounts?'),
    ).toBeInTheDocument();
  });

  it('reads a refusal as a message rather than a failure', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({
          wasRefused: true,
          message: 'I can only help you set the app up.',
        }),
      ),
    });
    renderPage();

    await say('write me a poem instead');

    expect(
      await screen.findByText('I can only help you set the app up.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the turn cannot be had at all', async () => {
    stubApi({
      '/api/setup/conversation': () =>
        new Response(JSON.stringify({ error: 'The model could not answer.' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    renderPage();

    await say('the 5th');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The model could not answer.',
    );
  });

  it('writes nothing while the conversation is still going', async () => {
    stubApi({ '/api/setup/conversation': conversation(turn()) });
    renderPage();

    await say('the 5th');
    await screen.findByText('And where do you keep your money?');

    expect(requests().filter(({ url }) => url.includes('/apply'))).toHaveLength(
      0,
    );
    expect(
      screen.queryByRole('button', { name: 'Create everything' }),
    ).not.toBeInTheDocument();
  });

  it('creates everything in one step once the draft is complete', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({
          nextSection: null,
          isComplete: true,
          message: 'That is everything I need.',
          established: [
            { section: 'BUCKETS', summary: 'Reserve — 20% each cycle.' },
          ],
        }),
      ),
      '/api/setup/conversation/conv-1/apply': applied,
    });
    renderPage();

    await say('20% to the reserve');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create everything' }),
    );

    expect(await screen.findByText(/2 accounts/)).toBeInTheDocument();
    expect(screen.getByText(/4 recurring templates/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Main' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      requests().filter(
        ({ url, method }) => url.includes('/apply') && method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it("tracks the draft's progress instead of a step indicator", async () => {
    stubApi({
      '/api/setup/conversation': conversation(turn({ nextSection: 'CARDS' })),
    });
    renderPage();

    await say('the 5th');

    expect(await screen.findByText(/Credit cards/)).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { current: 'step' })).toBeNull();
  });
});
