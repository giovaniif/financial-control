import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Amount } from './amount.js';
import { Button } from './button.js';
import { Card, CardTitle } from './card.js';
import { EmptyState } from './empty-state.js';
import { StatTile } from './stat-tile.js';
import { Stepper } from './stepper.js';

describe('Amount', () => {
  it('renders integer cents as BRL', () => {
    render(<Amount cents={123_456} />);

    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });

  it('renders a compact figure when the exact cents are noise', () => {
    render(<Amount cents={14_200_000} compact />);

    expect(screen.getByText(/142,0k/)).toBeInTheDocument();
  });

  // Sign and colour treatment is uniform across every screen, so it is the
  // one thing about this component worth pinning down.
  it.each([
    ['money out is red', -100, 'text-red-700'],
    ['money in is green', 100, 'text-green-700'],
    ['zero is neither', 0, 'text-zinc-500'],
  ])('%s', (_name, cents, tone) => {
    const { container } = render(<Amount cents={cents} signed />);

    expect(container.firstChild).toHaveClass(tone);
  });

  it('stays neutral when it is a plain total rather than a movement', () => {
    const { container } = render(<Amount cents={-100} />);

    expect(container.firstChild).toHaveClass('text-zinc-900');
  });
});

describe('Button', () => {
  it('calls its handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Settle</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Settle' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire while disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Close cycle
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('titles its section', () => {
    render(
      <Card>
        <CardTitle>Buckets</CardTitle>
        <p>body</p>
      </Card>,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Buckets',
    );
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  // The app ships empty, so a blank panel is never the right answer.
  it('says what is missing and what to do next', () => {
    render(<EmptyState title="No accounts yet" body="Add one in Settings." />);

    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
    expect(screen.getByText('Add one in Settings.')).toBeInTheDocument();
  });
});

describe('Stepper', () => {
  const steps = [
    { id: 'why', label: 'Why' },
    { id: 'cycle', label: 'The cycle' },
    { id: 'accounts', label: 'Accounts' },
  ];

  it('lists the steps in order', () => {
    render(<Stepper steps={steps} current={0} />);

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      ['1Why', '2The cycle', '3Accounts'],
    );
  });

  it('marks where the user is, so a screen reader can announce it', () => {
    render(<Stepper steps={steps} current={1} />);

    expect(screen.getByText('The cycle').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('distinguishes the steps already done from the ones still ahead', () => {
    render(<Stepper steps={steps} current={1} />);

    const [done, , upcoming] = screen.getAllByRole('listitem');

    expect(done).toHaveAttribute('data-state', 'done');
    expect(upcoming).toHaveAttribute('data-state', 'upcoming');
  });
});

describe('StatTile', () => {
  it('carries the note saying what the figure is made of', () => {
    render(
      <StatTile
        label="Total Outcome"
        cents={-911_000}
        note="12 fixed entries and 1 invoice"
        signed
      />,
    );

    expect(screen.getByText('Total Outcome')).toBeInTheDocument();
    expect(screen.getByText(/9\.110,00/)).toBeInTheDocument();
    expect(
      screen.getByText('12 fixed entries and 1 invoice'),
    ).toBeInTheDocument();
  });
});
