import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './dialog.js';

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} title="Add an entry" onClose={vi.fn()}>
        body
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a labelled dialog when open', () => {
    render(
      <Dialog open title="Add an entry" onClose={vi.fn()}>
        body
      </Dialog>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Add an entry' }),
    ).toBeInTheDocument();
  });

  // Named "Dismiss" rather than "Close": closing is a domain verb in this app
  // (UC-3.8), and a dialog control must not compete with it.
  it('closes on the dismiss button', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Add an entry" onClose={onClose}>
        body
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Add an entry" onClose={onClose}>
        body
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });
});
