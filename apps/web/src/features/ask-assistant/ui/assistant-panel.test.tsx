import type {
  AssistantProposalResponse,
  AssistantTurnResponse,
} from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBuckets } from '@/entities/bucket';
import { useCycle } from '@/entities/cycle';
import { useDashboard } from '@/entities/dashboard';
import { renderWithProviders, sseStub, stubApi } from '@/shared/testing';
import type { SseStub } from '@/shared/testing';

import { AssistantPanel } from './assistant-panel.js';

const MONTH = '2026-09';

const proposal = (
  overrides: Partial<AssistantProposalResponse> = {},
): AssistantProposalResponse => ({
  id: 'p1',
  kind: 'ADD_ENTRY',
  summary:
    'Add “Dentist” to the 2026-09 cycle — a fixed of R$ 300,00 due on 2026-09-20.',
  proposedAt: '2026-08-18T10:00:00.000Z',
  ...overrides,
});

const turn = (
  overrides: Partial<AssistantTurnResponse> = {},
): AssistantTurnResponse => ({
  conversationId: 'c1',
  message: 'Because the Inter invoice lands in it.',
  reads: [{ tool: 'read_cycle', failure: null }],
  proposals: [],
  wasRefused: false,
  hitReadLimit: false,
  ...overrides,
});

/**
 * The assistant sits beside the figures it reads, so what a confirmation
 * moves has to be visible in the same tree.
 */
function Screen() {
  const dashboard = useDashboard(MONTH);
  const cycle = useCycle(MONTH);
  const buckets = useBuckets();

  return (
    <div>
      <h2>Main</h2>
      <p>
        {dashboard.isSuccess && cycle.isSuccess && buckets.isSuccess
          ? 'figures ready'
          : 'loading'}
      </p>
      <AssistantPanel />
    </div>
  );
}

function stubStream(stream: SseStub, routes: Record<string, unknown> = {}) {
  stubApi({
    '/api/dashboard': { headline: {}, kpis: [] },
    [`/api/cycles/${MONTH}`]: { month: MONTH, chain: {}, entries: [] },
    '/api/assistant/messages': () => stream.response,
    ...routes,
  });
}

const ask = async (question: string) => {
  await userEvent.type(screen.getByLabelText('Ask about your money'), question);
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
};

function callsTo(path: string): number {
  const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
  const calls = mock.mock.calls as unknown as [string, RequestInit?][];

  return calls.filter((call) => call[0].includes(path)).length;
}

function lastBodyTo(path: string): unknown {
  const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
  const calls = mock.mock.calls as unknown as [string, RequestInit?][];
  const match = calls.filter((call) => call[0].includes(path));
  const body = match[match.length - 1]?.[1]?.body;

  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AssistantPanel', () => {
  /** UC-8.1 — the answer is written as it is thought, not handed over at the end. */
  it('shows the answer as it arrives', async () => {
    const stream = sseStub();
    stubStream(stream);
    renderWithProviders(<AssistantPanel />);

    await ask('Why is September lower than August?');
    stream.send({ event: 'text', data: { delta: 'Because the Inter ' } });

    expect(await screen.findByText(/Because the Inter/)).toBeInTheDocument();

    stream.send({ event: 'text', data: { delta: 'invoice lands in it.' } });

    expect(
      await screen.findByText(/Because the Inter invoice lands in it\./),
    ).toBeInTheDocument();

    stream.send({ event: 'turn', data: turn() });
    stream.close();

    const log = await screen.findByRole('log', {
      name: 'Assistant conversation',
    });
    expect(log).toHaveTextContent('Why is September lower than August?');
    expect(log).toHaveTextContent('Because the Inter invoice lands in it.');
  });

  /** UC-8.2 — the figures come from the app, and the panel says which it read. */
  it('says what it is reading while it reads', async () => {
    const stream = sseStub();
    stubStream(stream);
    renderWithProviders(<AssistantPanel />);

    await ask('What is my biggest bill?');
    stream.send({
      event: 'tool',
      data: { tool: 'read_cycle', failure: null },
    });

    expect(await screen.findByText(/read_cycle/)).toBeInTheDocument();

    stream.send({ event: 'turn', data: turn() });
    stream.close();

    // Still named once the answer is finished: what it read is part of the
    // answer, not a spinner that disappears with it.
    const log = await screen.findByRole('log', {
      name: 'Assistant conversation',
    });
    await waitFor(() => {
      expect(log).toHaveTextContent('read_cycle');
      expect(log).toHaveTextContent('Because the Inter invoice lands in it.');
    });
  });

  /** UC-8.3 — shown as what it will do, and which cycle it lands in. */
  it('renders a proposal in the app’s own terms, naming its cycle', async () => {
    const stream = sseStub();
    stubStream(stream);
    renderWithProviders(<AssistantPanel />);

    await ask('Add a R$ 300 dentist bill due on the 20th.');
    stream.send({
      event: 'turn',
      data: turn({ proposals: [proposal()] }),
    });
    stream.close();

    expect(await screen.findByText('Add an entry')).toBeInTheDocument();
    expect(
      screen.getByText(/Add “Dentist” to the September 2026 cycle/),
    ).toBeInTheDocument();
    expect(screen.getByText(/due on 20\/09\/2026/)).toBeInTheDocument();
    expect(
      screen.getByText('Lands in the September 2026 cycle.'),
    ).toBeInTheDocument();
  });

  it('applies a confirmed proposal and moves the figures with it', async () => {
    const stream = sseStub();
    stubStream(stream, {
      '/api/assistant/proposals/p1/apply': {
        proposalId: 'p1',
        kind: 'ADD_ENTRY',
        summary: proposal().summary,
      },
    });
    renderWithProviders(<Screen />);

    await ask('Add a R$ 300 dentist bill due on the 20th.');
    stream.send({ event: 'turn', data: turn({ proposals: [proposal()] }) });
    stream.close();

    await screen.findByText('figures ready');
    const before = {
      dashboard: callsTo('/api/dashboard'),
      cycle: callsTo(`/api/cycles/${MONTH}`),
      buckets: callsTo('/api/buckets'),
    };

    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm' }),
    );

    await waitFor(() => {
      expect(lastBodyTo('/api/assistant/proposals/p1/apply')).toEqual({
        summary: proposal().summary,
      });
    });
    await waitFor(() => {
      expect(callsTo('/api/dashboard')).toBeGreaterThan(before.dashboard);
      expect(callsTo(`/api/cycles/${MONTH}`)).toBeGreaterThan(before.cycle);
      expect(callsTo('/api/buckets')).toBeGreaterThan(before.buckets);
    });
    expect(await screen.findByText('Applied')).toBeInTheDocument();
  });

  /** UC-8.3 — dismissing writes nothing at all. */
  it('writes nothing when a proposal is dismissed', async () => {
    const stream = sseStub();
    stubStream(stream);
    renderWithProviders(<AssistantPanel />);

    await ask('Add a R$ 300 dentist bill due on the 20th.');
    stream.send({ event: 'turn', data: turn({ proposals: [proposal()] }) });
    stream.close();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Dismiss' }),
    );

    expect(screen.queryByText('Add an entry')).not.toBeInTheDocument();
    expect(callsTo('/api/assistant/proposals')).toBe(0);
  });

  it('keeps a refused proposal on screen, with the reason', async () => {
    const stream = sseStub();
    stubStream(stream, {
      '/api/assistant/proposals/p1/apply': new Response(
        JSON.stringify({ error: 'The September cycle is closed.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    renderWithProviders(<AssistantPanel />);

    await ask('Add a R$ 300 dentist bill due on the 20th.');
    stream.send({ event: 'turn', data: turn({ proposals: [proposal()] }) });
    stream.close();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The app refused the change: The September cycle is closed.',
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  /** UC-8.5 — no key is a state the app is expected to be in, not a crash. */
  it('says the assistant is switched off and leaves the screen working', async () => {
    stubApi({
      '/api/dashboard': { headline: {}, kpis: [] },
      [`/api/cycles/${MONTH}`]: { month: MONTH, chain: {}, entries: [] },
      '/api/setup': {
        anchorConfigured: true,
        accounts: 1,
        cards: 0,
        templates: 1,
        buckets: 0,
        isPristine: false,
        assistantAvailable: false,
      },
    });
    renderWithProviders(<Screen />);

    expect(
      await screen.findByText(/The assistant is switched off/),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Main' })).toBeInTheDocument();
    expect(await screen.findByText('figures ready')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Ask about your money'),
    ).not.toBeInTheDocument();
  });

  /** A question asked yesterday is still there — the panel is not a session. */
  it('keeps the conversation across a reload', async () => {
    const stream = sseStub();
    stubStream(stream);
    const view = renderWithProviders(<AssistantPanel />);

    await ask('Why is September lower than August?');
    stream.send({ event: 'turn', data: turn() });
    stream.close();
    await screen.findByText('Because the Inter invoice lands in it.');

    view.unmount();
    renderWithProviders(<AssistantPanel />);

    expect(
      await screen.findByText('Because the Inter invoice lands in it.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Why is September lower than August?'),
    ).toBeInTheDocument();
  });

  /**
   * The stream only fails once the headers are out, so what had already been
   * written is worth keeping — with the reason it stopped beneath it.
   */
  it('keeps what was written when the stream stops early', async () => {
    const stream = sseStub();
    stubStream(stream);
    renderWithProviders(<AssistantPanel />);

    await ask('Why is September lower than August?');
    stream.send({ event: 'text', data: { delta: 'Because the Inter ' } });
    await screen.findByText(/Because the Inter/);
    stream.send({
      event: 'error',
      data: {
        error: 'The assistant stopped before it had answered.',
        status: 502,
      },
    });
    stream.close();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The assistant stopped before it had answered.',
    );
    const log = screen.getByRole('log', { name: 'Assistant conversation' });
    expect(log).toHaveTextContent('Because the Inter');
  });

  /** A refusal and a read limit are answers about the answer, not failures. */
  it('reads a refusal and a read limit as answers, not errors', async () => {
    const stream = sseStub();
    stubStream(stream);
    renderWithProviders(<AssistantPanel />);

    await ask('Transfer everything to my brother.');
    stream.send({
      event: 'turn',
      data: turn({
        message: 'That is not something I can do.',
        wasRefused: true,
        hitReadLimit: true,
      }),
    });
    stream.close();

    expect(await screen.findByText(/declined to answer/)).toBeInTheDocument();
    expect(screen.getByText(/stopped reading/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
