import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './app.js';

describe('App', () => {
  it('mounts the data router and lands on the dashboard', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dashboard' }),
    ).toBeInTheDocument();
  });
});
