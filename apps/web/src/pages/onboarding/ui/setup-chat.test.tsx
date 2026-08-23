import type {
  EstablishedRecordResponse,
  SetupAppliedResponse,
  SetupTurnResponse,
} from '@fin/contracts';
import { screen, within } from '@testing-library/react';
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
  removed: [],
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

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;

  return input instanceof URL ? input.href : input.url;
}

/** What the app actually asked the network for, in call order. */
function requests(): { url: string; method: string }[] {
  return vi.mocked(fetch).mock.calls.map(([input, init]) => ({
    url: urlOf(input),
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
              id: 'rec-1',
              summary: 'Health plan — R$ 320,00 on day 8.',
              fields: {
                name: 'Health plan',
                amount: -32_000,
                dueDayOfMonth: 8,
                isEstimate: false,
              },
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
              id: 'rec-1',
              summary:
                'Apartment — 20% each cycle toward R$ 150.000,00 by 2031-03-05, funded #1.',
              fields: {
                mode: 'GOAL',
                name: 'Apartment',
                rule: { kind: 'PERCENT', percent: 20 },
                priority: 1,
                target: 15_000_000,
                targetDate: '2031-03-05',
              },
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
            {
              section: 'BUCKETS',
              id: 'rec-1',
              summary: 'Reserve — 20% each cycle.',
              fields: {
                mode: 'ONGOING',
                name: 'Reserve',
                rule: { kind: 'PERCENT', percent: 20 },
                priority: 1,
              },
            },
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
    expect(
      screen.getByText(/4 recurring bills and income/),
    ).toBeInTheDocument();
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

/** What a structured correction actually sent, parsed, in call order. */
function sentBy(method: string): { url: string; body: unknown }[] {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === method)
    .map(([input, init]) => ({
      url: urlOf(input),
      body:
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as unknown)
          : undefined,
    }));
}

const bill = (
  summary: string,
  name = 'Health plan',
  amount = 32_000,
): EstablishedRecordResponse => ({
  section: 'FIXED_BILLS',
  id: 'rec-1',
  summary,
  fields: { name, amount: -amount, dueDayOfMonth: 8, isEstimate: false },
});

/** A turn that established one bill, so there is something to correct. */
const established = (
  summary = 'Health plan — R$ 320,00 on day 8.',
): SetupTurnResponse => turn({ established: [bill(summary)] });

const openEditor = async (name: string) => {
  await userEvent.click(
    await screen.findByRole('button', { name: `Edit ${name}` }),
  );
};

const retype = async (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, value);
};

describe('correcting a record inside the conversation', () => {
  it('sends only the field that changed, and shows the record again', async () => {
    stubApi({
      '/api/setup/conversation': conversation(established()),
      '/api/setup/conversation/conv-1/records/rec-1': turn({
        message: 'Health plan is R$ 350,00 now.',
        established: [
          bill('Health plan — R$ 350,00 on day 8.', 'Health plan', 35_000),
        ],
        nextSection: 'FIXED_BILLS',
      }),
    });
    renderPage();

    await say('health plan 320 on the 8th');
    await openEditor('Health plan');
    await retype('Amount', '350');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Health plan — R$ 350,00 on day 8.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Health plan — R$ 320,00 on day 8.'),
    ).not.toBeInTheDocument();
    expect(sentBy('PATCH')).toEqual([
      {
        url: '/api/setup/conversation/conv-1/records/rec-1',
        body: { amount: 35_000 },
      },
    ]);
  });

  it('drops a record it should never have understood', async () => {
    stubApi({
      '/api/setup/conversation': conversation(established()),
      '/api/setup/conversation/conv-1/records/rec-1': turn({
        message: 'Dropped it.',
        removed: ['rec-1'],
      }),
    });
    renderPage();

    await say('health plan 320 on the 8th');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Drop Health plan' }),
    );

    expect(await screen.findByText('Dropped it.')).toBeInTheDocument();
    expect(
      screen.queryByText('Health plan — R$ 320,00 on day 8.'),
    ).not.toBeInTheDocument();
  });

  it('leaves the record as it was when the rule refuses the correction', async () => {
    stubApi({
      '/api/setup/conversation': conversation(established()),
      '/api/setup/conversation/conv-1/records/rec-1': () =>
        new Response(
          JSON.stringify({
            error: 'Day 31 never reaches the September cycle.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    renderPage();

    await say('health plan 320 on the 8th');
    await openEditor('Health plan');
    await retype('Due day of month', '31');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Day 31 never reaches the September cycle.',
    );
    expect(
      screen.getByText('Health plan — R$ 320,00 on day 8.'),
    ).toBeInTheDocument();
  });

  // The anchor and the salary hold one value each: they are said again, not
  // corrected, so there is no form to open on them.
  it('offers no inline edit on a section holding a single value', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({
          established: [
            {
              section: 'ANCHOR',
              id: null,
              summary: 'Paid on day 5, moving to the preceding business day.',
              fields: null,
            },
          ],
        }),
      ),
    });
    renderPage();

    await say('the 5th');

    expect(
      await screen.findByText(
        'Paid on day 5, moving to the preceding business day.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Drop/ })).toBeNull();
  });
});

describe('the last moment before anything is written', () => {
  const complete = turn({
    nextSection: null,
    isComplete: true,
    message: 'That is everything I need.',
    established: [
      {
        section: 'ANCHOR',
        id: null,
        summary: 'Paid on day 5, moving to the preceding business day.',
        fields: null,
      },
      {
        section: 'ACCOUNTS',
        id: 'rec-1',
        summary: 'Checking — a checking account holding R$ 2.160,00.',
        fields: { name: 'Checking', type: 'CHECKING', balance: 216_000 },
      },
      {
        section: 'FIXED_BILLS',
        id: 'rec-2',
        summary: 'Health plan — R$ 320,00 on day 8.',
        fields: {
          name: 'Health plan',
          amount: -32_000,
          dueDayOfMonth: 8,
          isEstimate: false,
        },
      },
    ],
  });

  it('reads back the whole draft, grouped, before it is created', async () => {
    stubApi({ '/api/setup/conversation': conversation(complete) });
    renderPage();

    await say('20% to the reserve');

    const review = within(
      await screen.findByRole('region', { name: 'Your draft' }),
    );
    expect(
      review.getByText('Paid on day 5, moving to the preceding business day.'),
    ).toBeInTheDocument();
    expect(
      review.getByText('Checking — a checking account holding R$ 2.160,00.'),
    ).toBeInTheDocument();
    expect(
      review.getByText('Health plan — R$ 320,00 on day 8.'),
    ).toBeInTheDocument();
    expect(
      review.getByRole('heading', { name: 'Accounts' }),
    ).toBeInTheDocument();
    expect(
      review.getByRole('button', { name: 'Create everything' }),
    ).toBeInTheDocument();
  });

  it('leaves a dropped record out of the review', async () => {
    stubApi({
      '/api/setup/conversation': conversation(complete),
      '/api/setup/conversation/conv-1/records/rec-1': turn({
        message: 'Dropped it.',
        removed: ['rec-1'],
        nextSection: null,
        isComplete: true,
      }),
    });
    renderPage();

    await say('20% to the reserve');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Drop Checking' }),
    );
    await screen.findByText('Dropped it.');

    const review = within(screen.getByRole('region', { name: 'Your draft' }));
    expect(
      review.queryByText('Checking — a checking account holding R$ 2.160,00.'),
    ).toBeNull();
    expect(
      review.getByText('Health plan — R$ 320,00 on day 8.'),
    ).toBeInTheDocument();
  });
});

describe('the fields an edit opens on', () => {
  const editing = (record: SetupTurnResponse['established'][number]) => {
    stubApi({
      '/api/setup/conversation': conversation(turn({ established: [record] })),
      [`/api/setup/conversation/conv-1/records/${String(record.id)}`]: turn({
        message: 'Changed.',
        established: [record],
      }),
    });
    renderPage();
  };

  it('changes what kind of account it is', async () => {
    editing({
      section: 'ACCOUNTS',
      id: 'rec-1',
      summary: 'Nubank — a checking account holding R$ 2.160,00.',
      fields: { name: 'Nubank', type: 'CHECKING', balance: 216_000 },
    });

    await say('nubank has 2160');
    await openEditor('Nubank');
    await userEvent.selectOptions(screen.getByLabelText('Kind'), 'SAVINGS');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Changed.')).toBeInTheDocument();
    expect(sentBy('PATCH')[0]?.body).toEqual({ type: 'SAVINGS' });
  });

  it('changes the day a card closes without touching its due day', async () => {
    editing({
      section: 'CARDS',
      id: 'rec-1',
      summary:
        'Inter — limit R$ 10.000,00, closing on day 28, due on day 10, paid from Checking.',
      fields: {
        name: 'Inter',
        limit: 1_000_000,
        closingDay: 28,
        dueDay: 10,
        paymentAccountName: 'Checking',
      },
    });

    await say('inter closes on the 28th, due the 10th');
    await openEditor('Inter');
    await retype('Closing day', '25');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Changed.')).toBeInTheDocument();
    expect(sentBy('PATCH')[0]?.body).toEqual({ closingDay: 25 });
  });

  it('swaps a fixed contribution for a share of Expected Surplus', async () => {
    editing({
      section: 'BUCKETS',
      id: 'rec-1',
      summary:
        'Apartment — R$ 1.778,00 each cycle toward R$ 150.000,00 by 2031-03-05, funded #1.',
      fields: {
        mode: 'GOAL',
        name: 'Apartment',
        rule: { kind: 'FIXED', amount: 177_800 },
        priority: 1,
        target: 15_000_000,
        targetDate: '2031-03-05',
      },
    });

    await say('1778 a cycle to the apartment');
    await openEditor('Apartment');
    await userEvent.selectOptions(
      screen.getByLabelText('Each cycle'),
      'PERCENT',
    );
    await retype('Share of Expected Surplus (%)', '20');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Changed.')).toBeInTheDocument();
    expect(sentBy('PATCH')[0]?.body).toEqual({
      rule: { kind: 'PERCENT', percent: 20 },
    });
  });

  it('marks a bill as a guess rather than a known figure', async () => {
    editing(
      bill(
        'Contractor costs — R$ 1.500,00 on day 8.',
        'Contractor costs',
        150_000,
      ),
    );

    await say('contractor costs about 1500 on the 8th');
    await openEditor('Contractor costs');
    await userEvent.click(
      screen.getByLabelText('An estimate, not a confirmed figure'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Changed.')).toBeInTheDocument();
    expect(sentBy('PATCH')[0]?.body).toEqual({ isEstimate: true });
  });

  it('asks for nothing when the edit is abandoned', async () => {
    editing(bill('Health plan — R$ 320,00 on day 8.'));

    await say('health plan 320 on the 8th');
    await openEditor('Health plan');
    await retype('Amount', '350');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Amount')).toBeNull();
    expect(sentBy('PATCH')).toEqual([]);
  });
});
