import { describe, expect, it } from 'vitest';

import { zero } from './legal.js';

describe('zero', () => {
  it('is worth nothing', () => {
    expect(zero().cents).toBe(0);
  });
});
