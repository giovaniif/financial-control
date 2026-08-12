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
  await userEvent.click(screen.getByRole('button', { name: 'Add a bucket' }));
};

describe('CreateBucketButton', () => {
  /**
   * UC-6.1 — the mode is a real invariant, not a display flag. A goal without
   * a target and a target date is rejected by the domain, so the form refuses
   * it rather than letting the request fail.
   */
  it('will not create a goal without a target and a target date', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Apartment');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('A goal needs a target.')).toBeInTheDocument();
    expect(
      screen.getByText('A goal needs the date you want it by.'),
    ).toBeInTheDocument();
  });

  it('asks an ongoing bucket for neither', async () => {
    await open();
    await userEvent.click(screen.getByRole('radio', { name: /Ongoing/ }));

    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Target date')).not.toBeInTheDocument();
  });

  it('creates a goal with its target and rule', async () => {
    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Apartment');
    await userEvent.type(screen.getByLabelText('Target'), '150.000,00');
    await userEvent.type(screen.getByLabelText('Target date'), '2031-03-31');
    await userEvent.clear(screen.getByLabelText('Percent of Expected Surplus'));
    await userEvent.type(
      screen.getByLabelText('Percent of Expected Surplus'),
      '20',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

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
    await userEvent.click(screen.getByRole('radio', { name: /Ongoing/ }));
    await userEvent.type(screen.getByLabelText('Name'), 'Investments');
    await userEvent.click(
      screen.getByRole('radio', { name: 'A fixed amount' }),
    );
    await userEvent.type(screen.getByLabelText('Amount per cycle'), '1.778,00');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Add a bucket' }));
    await userEvent.click(screen.getByRole('radio', { name: /Ongoing/ }));
    await userEvent.type(screen.getByLabelText('Name'), 'Reserve');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(lastBody()).toMatchObject({ priority: 4 });
  });
});
