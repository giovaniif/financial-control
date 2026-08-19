import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantRailProvider } from './assistant-rail.js';
import { useAssistantRail } from './use-assistant-rail.js';

/** A window the test can declare wide or narrow, as a resize would. */
function stubWidth(isWide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      matches: isWide,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

function Probe() {
  const { isOpen, toggle, ask, pendingQuestion, takePendingQuestion } =
    useAssistantRail();

  return (
    <div>
      <p>{isOpen ? 'open' : 'closed'}</p>
      <p>Pending: {pendingQuestion ?? 'nothing'}</p>
      <button onClick={toggle}>Toggle</button>
      <button
        onClick={() => {
          ask('Why is September lower than August?');
        }}
      >
        Hand over a question
      </button>
      <button onClick={takePendingQuestion}>Take the question</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <AssistantRailProvider>
      <Probe />
    </AssistantRailProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  stubWidth(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssistantRailProvider', () => {
  it('starts collapsed, so the app opens on the figures', () => {
    renderProbe();

    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('remembers that the rail was open across a reload', async () => {
    const view = renderProbe();

    await userEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByText('open')).toBeInTheDocument();

    view.unmount();
    renderProbe();

    expect(screen.getByText('open')).toBeInTheDocument();
  });

  /**
   * Narrow, the rail covers the figures rather than sitting beside them, so
   * reopening it on load would open the app onto the chat instead of the
   * numbers. The preference is kept, not honoured.
   */
  it('rests collapsed on a narrow window even when it was left open', async () => {
    const view = renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    view.unmount();

    stubWidth(false);
    renderProbe();

    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  // UC-4.7 with UC-8 — an alert hands its question over; nothing is sent.
  it('opens the rail and offers the question it was handed', async () => {
    renderProbe();

    await userEvent.click(
      screen.getByRole('button', { name: 'Hand over a question' }),
    );

    expect(screen.getByText('open')).toBeInTheDocument();
    expect(
      screen.getByText('Pending: Why is September lower than August?'),
    ).toBeInTheDocument();
  });

  it('forgets the question once the composer has taken it', async () => {
    renderProbe();

    await userEvent.click(
      screen.getByRole('button', { name: 'Hand over a question' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Take the question' }),
    );

    expect(screen.getByText('Pending: nothing')).toBeInTheDocument();
  });

  it('refuses to be read outside its provider', () => {
    expect(() => render(<Probe />)).toThrow(/AssistantRailProvider/);
  });
});
