import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { EstimatesToggle } from './estimates-toggle.js';

describe('EstimatesToggle', () => {
  it('starts on including estimates, the app\u2019s full picture', () => {
    renderWithProviders(<EstimatesToggle />);

    expect(screen.getByRole('button')).toHaveTextContent('Com estimativas');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  // A total that mixes a guess with a known bill is the failure this prevents.
  it('switches to confirmed only', async () => {
    renderWithProviders(<EstimatesToggle />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('Somente confirmados');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches back', async () => {
    renderWithProviders(<EstimatesToggle />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('Com estimativas');
  });
});
