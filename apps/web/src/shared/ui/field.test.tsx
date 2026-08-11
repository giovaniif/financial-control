import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Field } from './field.js';

describe('Field', () => {
  it('labels its input, so it can be found the way a user finds it', async () => {
    render(<Field label="Description" defaultValue="" />);

    await userEvent.type(screen.getByLabelText('Description'), 'Dinner');

    expect(screen.getByLabelText('Description')).toHaveValue('Dinner');
  });

  it('states the problem when the value is refused', () => {
    render(<Field label="Amount" error="Enter an amount like 1.234,56" />);

    expect(screen.getByLabelText('Amount')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter an amount like 1.234,56',
    );
  });

  it('carries a hint when the input needs explaining', () => {
    render(<Field label="Due date" type="date" hint="Inside 5 Aug – 4 Sep" />);

    expect(screen.getByText('Inside 5 Aug – 4 Sep')).toBeInTheDocument();
  });
});
