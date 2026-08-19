import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hasSkippedSetup } from '@/shared/model';
import { renderWithProviders, stubApi } from '@/shared/testing';

import { STEPS } from '../model/steps.js';
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

describe('OnboardingPage', () => {
  it('opens on the first step', async () => {
    stubApi({});
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: /Why this app/ }),
    ).toBeInTheDocument();
  });

  // There is nothing to navigate to yet, and a sidebar full of empty screens
  // is the thing the wizard exists to avoid showing.
  it('renders without the app shell', async () => {
    stubApi({});
    renderPage();

    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('navigation', { name: 'Main' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('In accounts now')).not.toBeInTheDocument();
  });

  it('cannot go back from the first step', async () => {
    stubApi({});
    renderPage();

    expect(await screen.findByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('advances to the next step and back again', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /Next|Continue/ }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /payday cycle/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /Why this app/ }),
    ).toBeInTheDocument();
  });

  it('marks the current step in the indicator', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /Next|Continue/ }),
    );

    const current = screen
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step');

    expect(current).toHaveTextContent('The payday cycle');
  });

  // The app stays fully usable without finishing setup; that escape hatch is
  // what makes an automatic redirect acceptable in the first place.
  it('lets the user leave for the app', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip for now' }),
    );

    expect(await screen.findByText('Main')).toBeInTheDocument();
    expect(hasSkippedSetup()).toBe(true);
  });

  it('opens on the two questions the app exists to answer', async () => {
    stubApi({});
    renderPage();

    expect(
      await screen.findByText(/how much will be left when I'm next paid/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/What does my future look like/),
    ).toBeInTheDocument();
  });

  describe('the payday cycle step', () => {
    const resolved = {
      cycles: [
        {
          month: '2026-09',
          label: 'September 2026',
          start: '2026-08-05',
          end: '2026-09-03',
          shifted: false,
          clamped: false,
        },
        {
          month: '2026-10',
          label: 'October 2026',
          start: '2026-09-04',
          end: '2026-10-04',
          shifted: true,
          clamped: false,
        },
      ],
    };

    const openCycleStep = async () => {
      renderPage();
      await userEvent.click(
        await screen.findByRole('button', { name: 'Continue' }),
      );
    };

    // Resolution lives in the domain's CycleRef, so the step shows the real
    // boundaries rather than a description of them.
    it('shows the cycles the chosen anchor actually produces', async () => {
      stubApi({ '/api/settings/anchor/resolve': resolved });
      await openCycleStep();

      expect(await screen.findByText('September 2026')).toBeInTheDocument();
      expect(screen.getByText('5 Aug – 3 Sep')).toBeInTheDocument();
    });

    it('calls out the cycles where payday moved off a closed day', async () => {
      stubApi({ '/api/settings/anchor/resolve': resolved });
      await openCycleStep();

      expect(
        await screen.findByText('payday moved off a closed day'),
      ).toBeInTheDocument();
    });

    it('explains how a last-day-of-month payday is expressed', async () => {
      stubApi({ '/api/settings/anchor/resolve': resolved });
      await openCycleStep();

      expect(await screen.findByText(/Use 31/)).toBeInTheDocument();
    });

    it('re-resolves when the anchor day changes', async () => {
      stubApi({ '/api/settings/anchor/resolve': resolved });
      await openCycleStep();

      const day = await screen.findByLabelText('Salary lands on day');
      await userEvent.clear(day);
      await userEvent.type(day, '20');

      expect(
        requests().filter(({ url }) => url.includes('anchor/resolve')).length,
      ).toBeGreaterThan(1);
    });

    it('saves the anchor before moving on', async () => {
      stubApi({ '/api/settings/anchor/resolve': resolved });
      await openCycleStep();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Continue' }),
      );

      expect(
        requests().find(
          ({ url, method }) =>
            url.endsWith('/settings/anchor') && method === 'PUT',
        ),
      ).toBeDefined();
    });
  });

  it('keeps what a step captured when the user goes back to it', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue' }),
    );
    const day = await screen.findByLabelText('Salary lands on day');
    await userEvent.clear(day);
    await userEvent.type(day, '12');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByLabelText('Salary lands on day')).toHaveValue(12);
  });

  describe('the later steps', () => {
    const goTo = async (title: string) => {
      const target = STEPS.findIndex((step) => step.title === title);
      renderPage();
      await screen.findByRole('heading', { level: 1 });

      for (let clicked = 0; clicked < target; clicked += 1) {
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      }
      await screen.findByRole('heading', { level: 1, name: title });
    };

    // UC-5.4 — the app's one genuinely counter-intuitive rule.
    it('teaches that an invoice lands in the cycle of its due date', async () => {
      stubApi({});
      await goTo('Credit cards and their invoices');

      expect(
        screen.getByText(/a whole cycle apart in cash/),
      ).toBeInTheDocument();
    });

    it('does not trap a user who has no credit card', async () => {
      stubApi({});
      await goTo('Credit cards and their invoices');

      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
      expect(
        screen.getByText(/Skip this step if you do not use one/),
      ).toBeInTheDocument();
    });

    // The due day is what gives the ledger a running balance rather than a
    // single monthly total.
    it('says why every template needs a due day', async () => {
      stubApi({});
      await goTo('What repeats every cycle');

      expect(screen.getByText(/running balance/)).toBeInTheDocument();
    });

    it('explains goal against ongoing as a real distinction', async () => {
      stubApi({});
      await goTo('What you are saving for');

      expect(
        screen.getByText(/asking an ongoing bucket how complete it is/i),
      ).toBeInTheDocument();
    });

    it('reports what was set up and opens the app', async () => {
      stubApi({
        '/api/setup': {
          anchorConfigured: true,
          accounts: 2,
          cards: 1,
          templates: 4,
          buckets: 3,
          isPristine: false,
        },
      });
      await goTo('You are set up');

      expect(
        await screen.findByRole('link', { name: 'Open Main' }),
      ).toHaveAttribute('href', '/');
      expect(screen.getByText('configured')).toBeInTheDocument();
      // Scoped to the summary row: the step indicator also renders a "4".
      expect(
        screen.getByText('Recurring templates').closest('div'),
      ).toHaveTextContent('4');
    });

    it('has nowhere further to go from the last step', async () => {
      stubApi({});
      await goTo('You are set up');

      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });
  });

  // A step change that only swaps the body leaves a screen reader on the old
  // heading, so the new one takes focus.
  it('moves focus to the new step heading', async () => {
    stubApi({});
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /Next|Continue/ }),
    );

    expect(await screen.findByRole('heading', { level: 1 })).toHaveFocus();
  });
});
