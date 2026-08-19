import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { OnboardingPage } from './onboarding-page.js';

const withoutAssistant = {
  anchorConfigured: false,
  accounts: 0,
  cards: 0,
  templates: 0,
  buckets: 0,
  isPristine: true,
  assistantAvailable: false,
};

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

describe('setting up without the assistant', () => {
  it('says plainly why it is asking in fields', async () => {
    stubApi({ '/api/setup': withoutAssistant });
    renderPage();

    expect(await screen.findByText(/Claude API key/)).toBeInTheDocument();
  });

  it('offers no conversation to type into', async () => {
    stubApi({ '/api/setup': withoutAssistant });
    renderPage();

    await screen.findByText(/Claude API key/);

    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it.each([
    'The payday cycle',
    'Where your money sits',
    'Salary and what repeats every cycle',
    'Credit cards and their invoices',
    'What you are saving for',
  ])('covers the %s section', async (heading) => {
    stubApi({ '/api/setup': withoutAssistant });
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 2, name: heading }),
    ).toBeInTheDocument();
  });

  it('saves the payday anchor the user chose', async () => {
    stubApi({ '/api/setup': withoutAssistant });
    renderPage();

    const day = await screen.findByLabelText('Salary lands on day');
    await userEvent.clear(day);
    await userEvent.type(day, '12');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the payday anchor' }),
    );

    expect(
      requests().find(
        ({ url, method }) =>
          url.endsWith('/settings/anchor') && method === 'PUT',
      ),
    ).toBeDefined();
  });

  it('reports what has been set up so far', async () => {
    stubApi({
      '/api/setup': {
        ...withoutAssistant,
        anchorConfigured: true,
        accounts: 2,
        templates: 4,
      },
    });
    renderPage();

    expect(await screen.findByText('configured')).toBeInTheDocument();
    expect(
      screen.getByText('Recurring templates').closest('div'),
    ).toHaveTextContent('4');
    expect(screen.getByRole('link', { name: 'Open Main' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
