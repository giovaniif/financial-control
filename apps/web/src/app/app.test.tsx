import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubApi } from '@/shared/testing';

import { App } from './app.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('mounts the data router and lands on Main', async () => {
    // The first-run gate holds every screen until it knows whether the app has
    // been set up, so even the smoke test has to answer that.
    stubApi({
      '/api/setup': {
        anchorConfigured: true,
        accounts: 1,
        cards: 0,
        templates: 0,
        buckets: 0,
        isPristine: false,
      },
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Main' }),
    ).toBeInTheDocument();
  });
});
