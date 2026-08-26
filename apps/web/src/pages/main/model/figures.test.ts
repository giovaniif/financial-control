import { describe, expect, it } from 'vitest';

import { figuresFor } from './figures.js';
import { dashboard } from './figures.fixture.js';

/**
 * The dashboard is built for whichever mode the header is in, so the screen
 * shows what it was sent. Reconciling two readings here is what this stopped
 * doing — the toggle is answered by the read model, which is where the two
 * chains are computed and where they are pinned against each other.
 */
describe('figuresFor', () => {
  it('shows the reading the server answered with', () => {
    const view = dashboard();

    expect(figuresFor(view)).toEqual({
      headline: view.headline,
      kpis: view.kpis,
      upcoming: view.upcoming,
      variance: view.variance,
    });
  });

  it('keeps an estimated entry the server chose to send', () => {
    const view = dashboard();

    expect(figuresFor(view).upcoming).toHaveLength(view.upcoming.length);
  });
});
