import { describe, expect, it } from 'vitest';

import { UuidIdSource } from './uuid-id-source.js';

describe('UuidIdSource', () => {
  it('issues a different identifier every time', () => {
    const ids = new UuidIdSource();

    expect(ids.next()).not.toBe(ids.next());
  });

  it('issues identifiers in the uuid shape the rest of the app stores', () => {
    expect(new UuidIdSource().next()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
