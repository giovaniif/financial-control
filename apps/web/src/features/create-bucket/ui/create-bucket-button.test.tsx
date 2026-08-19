import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { CreateBucketButton } from './create-bucket-button.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The JSON body of the most recent request. */
function lastBody(): unknown {
  const body = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body;

  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

const open = async () => {
  stubApi({});
  renderWithProviders(<CreateBucketButton existingCount={0} />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Adicionar caixinha' }),
  );
};

describe('CreateBucketButton', () => {
  /**
   * UC-6.1 — the mode is a real invariant, not a display flag. A goal without
   * a target and a target date is rejected by the domain, so the form refuses
   * it rather than letting the request fail.
   */
  it('will not create a goal without a target and a target date', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Apartment');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(
      screen.getByText('Uma meta precisa de um valor do objetivo.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Uma meta precisa de uma data para ser alcançada.'),
    ).toBeInTheDocument();
  });

  it('asks an ongoing bucket for neither', async () => {
    await open();
    await userEvent.click(screen.getByRole('radio', { name: /Contínua/ }));

    expect(
      screen.queryByLabelText('Valor do objetivo'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Data do objetivo')).not.toBeInTheDocument();
  });

  it('creates a goal with its target and rule', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Nome'), 'Apartment');
    await userEvent.type(
      screen.getByLabelText('Valor do objetivo'),
      '150.000,00',
    );
    await userEvent.type(
      screen.getByLabelText('Data do objetivo'),
      '2031-03-31',
    );
    await userEvent.clear(
      screen.getByLabelText('Percentual da Sobra Esperada'),
    );
    await userEvent.type(
      screen.getByLabelText('Percentual da Sobra Esperada'),
      '20',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(lastBody()).toEqual({
      mode: 'GOAL',
      name: 'Apartment',
      target: 15_000_000,
      targetDate: '2031-03-31',
      rule: { kind: 'PERCENT', percent: 20 },
      priority: 1,
    });
  });

  it('creates an ongoing bucket with a fixed amount', async () => {
    await open();
    await userEvent.click(screen.getByRole('radio', { name: /Contínua/ }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Investments');
    await userEvent.click(screen.getByRole('radio', { name: 'Um valor fixo' }));
    await userEvent.type(screen.getByLabelText('Valor por ciclo'), '1.778,00');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(lastBody()).toEqual({
      mode: 'ONGOING',
      name: 'Investments',
      rule: { kind: 'FIXED', amount: 177_800 },
      priority: 1,
    });
  });

  // UC-6.3 — priority decides who gets funded when the money runs short.
  it('lands after the buckets that already exist', async () => {
    stubApi({});
    renderWithProviders(<CreateBucketButton existingCount={3} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar caixinha' }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Contínua/ }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Reserve');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(lastBody()).toMatchObject({ priority: 4 });
  });
});
