import { describe, expect, it } from 'vitest';

import { InvalidPrincipal, Principal } from './principal.js';

describe('Principal', () => {
  it('is equal to another principal with the same id', () => {
    expect(Principal.of('someone').equals(Principal.of('someone'))).toBe(true);
  });

  it('is not equal to a principal with a different id', () => {
    expect(Principal.of('someone').equals(Principal.of('anyone'))).toBe(false);
  });

  it('is the same value every time the sole user is asked for', () => {
    expect(Principal.sole().equals(Principal.sole())).toBe(true);
  });

  it.each([[''], ['   ']])('refuses %o as an id', (id) => {
    expect(() => Principal.of(id)).toThrow(InvalidPrincipal);
  });
});
