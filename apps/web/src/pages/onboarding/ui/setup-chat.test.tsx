import type {
  EstablishedRecordResponse,
  SetupAppliedResponse,
  SetupTurnResponse,
} from '@fin/contracts';
import { screen, waitFor, within } from '@testing-library/react';
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
  await userEvent.type(await screen.findByLabelText('Sua resposta'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
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

/** The transcript item a line of the conversation sits in. */
function itemOf(node: HTMLElement): HTMLElement {
  const item = node.closest('li');
  if (item === null) {
    throw new Error('That line is not in the transcript.');
  }

  return item;
}

describe('the composer', () => {
  it('sends the answer on Enter', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({ message: 'And where do you keep your money?' }),
      ),
    });
    renderPage();

    await userEvent.type(
      await screen.findByLabelText('Sua resposta'),
      'the 5th{Enter}',
    );

    expect(
      await screen.findByText('And where do you keep your money?'),
    ).toBeInTheDocument();
  });

  it('breaks a line on Shift+Enter instead of sending', async () => {
    stubApi({ '/api/setup/conversation': conversation(turn()) });
    renderPage();

    const composer = await screen.findByLabelText('Sua resposta');
    await userEvent.type(
      composer,
      'health plan 320 on the 8th{Shift>}{Enter}{/Shift}electricity 280 on the 15th',
    );

    expect(composer).toHaveValue(
      'health plan 320 on the 8th\nelectricity 280 on the 15th',
    );
    expect(
      requests().filter(({ url }) => url.includes('/setup/conversation')),
    ).toHaveLength(0);
  });

  // The field is the whole composer, so the label it carries is the one a
  // screen reader reads and not one more line of chrome on the page.
  it('is labelled without a label on the page', async () => {
    stubApi({});
    renderPage();

    expect(await screen.findByLabelText('Sua resposta')).toBeInTheDocument();
    expect(screen.queryByText('Sua resposta')).toBeNull();
  });
});

describe('the shape of the conversation', () => {
  /**
   * A chat has no "before you have spoken" mode. From the first paint it is a
   * transcript and a composer, and Claude's opening question is simply the
   * first message — not a hero with an explanation wrapped around it.
   */
  it('is a transcript and a composer from the first paint', async () => {
    stubApi({ '/api/setup/conversation': conversation(turn()) });
    renderPage();

    expect(
      await screen.findByRole('log', { name: 'Conversa de configuração' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Sua resposta')).toBeInTheDocument();
    expect(screen.queryByText(/A configuração é uma conversa/)).toBeNull();
    expect(screen.queryByText(/sete perguntas/)).toBeNull();
  });

  /**
   * A step indicator turns a conversation back into a wizard: it says there
   * are seven things to get through rather than one question to answer. What
   * comes next is Claude's next question, which the transcript already shows.
   */
  it('counts no steps — the conversation is its own progress', async () => {
    stubApi({
      '/api/setup/conversation': conversation(turn({ nextSection: 'CARDS' })),
    });
    renderPage();

    await say('the 5th');
    await screen.findByText('And where do you keep your money?');

    expect(
      screen.queryByRole('navigation', { name: 'Setup progress' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem', { current: true })).toBeNull();
  });

  it('tells the two voices apart', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn({ message: 'And where do you keep your money?' }),
      ),
    });
    renderPage();

    await say('the 5th, moving back off a weekend');

    const answer = itemOf(
      await screen.findByText('the 5th, moving back off a weekend'),
    );
    const question = itemOf(
      await screen.findByText('And where do you keep your money?'),
    );

    expect(within(answer).getByText('Você')).toBeInTheDocument();
    expect(within(question).getByText('Claude')).toBeInTheDocument();
  });
});

describe('the setup conversation', () => {
  it('opens by asking about the payday cycle', async () => {
    stubApi({});
    renderPage();

    expect(
      await screen.findByRole('log', { name: 'Conversa de configuração' }),
    ).toHaveTextContent(/pagamento/i);
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

    await say('20% to the apartment, 150k by Março de 2031');

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
      screen.queryByRole('button', { name: 'Criar tudo' }),
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
      await screen.findByRole('button', { name: 'Criar tudo' }),
    );

    expect(await screen.findByText(/2 contas/)).toBeInTheDocument();
    expect(
      screen.getByText(/4 contas e receitas recorrentes/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir o Principal' }),
    ).toHaveAttribute('href', '/');
    expect(
      requests().filter(
        ({ url, method }) => url.includes('/apply') && method === 'POST',
      ),
    ).toHaveLength(1);
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
    await screen.findByRole('button', { name: `Editar ${name}` }),
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
    await retype('Valor', '350');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

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
      await screen.findByRole('button', { name: 'Descartar Health plan' }),
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
    await retype('Dia de vencimento', '31');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

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
      await screen.findByRole('region', { name: 'Seu rascunho' }),
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
    expect(review.getByRole('heading', { name: 'Contas' })).toBeInTheDocument();
    expect(
      review.getByRole('button', { name: 'Criar tudo' }),
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
      await screen.findByRole('button', { name: 'Descartar Checking' }),
    );
    await screen.findByText('Dropped it.');

    const review = within(screen.getByRole('region', { name: 'Seu rascunho' }));
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
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'SAVINGS');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

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
    await retype('Dia de fechamento', '25');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

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
      screen.getByLabelText('A cada ciclo'),
      'PERCENT',
    );
    await retype('Percentual da Sobra Esperada (%)', '20');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

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
      screen.getByLabelText('Uma estimativa, não um valor confirmado'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Changed.')).toBeInTheDocument();
    expect(sentBy('PATCH')[0]?.body).toEqual({ isEstimate: true });
  });

  it('asks for nothing when the edit is abandoned', async () => {
    editing(bill('Health plan — R$ 320,00 on day 8.'));

    await say('health plan 320 on the 8th');
    await openEditor('Health plan');
    await retype('Valor', '350');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Valor')).toBeNull();
    expect(sentBy('PATCH')).toEqual([]);
  });
});

/**
 * The frame, not the conversation: first run is a chat application — a top
 * bar that stays put, a transcript that scrolls under it, and a composer
 * pinned beneath. Layout itself is not assertable in jsdom, so what is
 * asserted here is which element scrolls, what is mounted and what is focused.
 */
describe('the chat frame', () => {
  const EXAMPLE = '18 mil, sempre no dia 5';

  it('opens on example answers rather than on an empty transcript', async () => {
    stubApi({});
    renderPage();

    const examples = within(
      await screen.findByRole('list', { name: 'Respostas de exemplo' }),
    );
    expect(examples.getByRole('button', { name: EXAMPLE })).toBeInTheDocument();
    expect(examples.getAllByRole('button').length).toBeGreaterThanOrEqual(2);
  });

  it('fills the composer with an example instead of sending it', async () => {
    stubApi({ '/api/setup/conversation': conversation(turn()) });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: EXAMPLE }));

    expect(screen.getByLabelText('Sua resposta')).toHaveValue(EXAMPLE);
    expect(
      requests().filter(({ url }) => url.includes('/setup/conversation')),
    ).toHaveLength(0);
  });

  it('leaves the opening behind once the conversation has started', async () => {
    stubApi({ '/api/setup/conversation': conversation(turn()) });
    renderPage();

    await say('the 5th');
    await screen.findByText('And where do you keep your money?');

    expect(
      screen.queryByRole('list', { name: 'Respostas de exemplo' }),
    ).toBeNull();
  });

  it('keeps the focus in the composer after sending', async () => {
    stubApi({ '/api/setup/conversation': conversation(turn()) });
    renderPage();

    await say('the 5th');
    await screen.findByText('And where do you keep your money?');

    expect(screen.getByLabelText('Sua resposta')).toHaveFocus();
  });

  it('scrolls the transcript to the newest turn, and reaches it by keyboard', async () => {
    stubApi({
      '/api/setup/conversation': conversation(
        turn(),
        turn({ message: 'And your bills?' }),
      ),
    });
    renderPage();

    await say('the 5th');
    const log = await screen.findByRole('log', {
      name: 'Conversa de configuração',
    });
    expect(log).toHaveAttribute('tabindex', '0');

    // jsdom lays nothing out, so the transcript is given a height to scroll.
    Object.defineProperty(log, 'scrollHeight', {
      value: 1200,
      configurable: true,
    });
    Object.defineProperty(log, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });

    await say('checking, 2160');
    await screen.findByText('And your bills?');

    await waitFor(() => {
      expect(log.scrollTop).toBe(1200);
    });
  });
});
