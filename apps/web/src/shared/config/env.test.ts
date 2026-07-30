import { describe, expect, it } from 'vitest';

import { resolveApiUrl } from './env.js';

describe('resolveApiUrl', () => {
  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['only whitespace', '   '],
    ['a non-string', 42],
  ])(
    'falls back to the same-origin proxy path when given %s',
    (_name, value) => {
      expect(resolveApiUrl(value)).toBe('/api');
    },
  );

  it('uses a configured absolute URL', () => {
    expect(resolveApiUrl('https://fin-api.onrender.com')).toBe(
      'https://fin-api.onrender.com',
    );
  });

  it('drops trailing slashes so paths are not doubled up', () => {
    expect(resolveApiUrl('https://fin-api.onrender.com//')).toBe(
      'https://fin-api.onrender.com',
    );
  });
});
