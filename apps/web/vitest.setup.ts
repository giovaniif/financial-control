import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library only registers its own cleanup when Vitest runs with
 * `globals: true`, which this project does not. Without this, every render
 * stacks up in the same document and the second test in a file starts finding
 * two of everything.
 */
afterEach(() => {
  cleanup();
});

/**
 * jsdom ships no `matchMedia`, and a component that renders differently at a
 * narrow width has to ask for it. The stand-in matches nothing, so every test
 * renders at the narrow end unless it stubs a wider window itself.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
