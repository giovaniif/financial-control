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

    expect(
      await screen.findByText(/chave de API do Claude/),
    ).toBeInTheDocument();
  });

  it('offers no conversation to type into', async () => {
    stubApi({ '/api/setup': withoutAssistant });
    renderPage();

    await screen.findByText(/chave de API do Claude/);

    expect(screen.queryByLabelText('Sua resposta')).not.toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it.each([
    'O ciclo de pagamento',
    'Onde o seu dinheiro está',
    'Salário e o que se repete a cada ciclo',
    'Cartões de crédito e suas faturas',
    'Para o que você está guardando',
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

    const day = await screen.findByLabelText('Salário cai no dia');
    await userEvent.clear(day);
    await userEvent.type(day, '12');
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar o dia do pagamento' }),
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

    expect(await screen.findByText('configurado')).toBeInTheDocument();
    expect(
      screen.getByText('Salário e contas').closest('div'),
    ).toHaveTextContent('4');
    expect(
      screen.getByRole('link', { name: 'Abrir o Principal' }),
    ).toHaveAttribute('href', '/');
  });
});
