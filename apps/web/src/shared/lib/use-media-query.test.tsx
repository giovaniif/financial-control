import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './use-media-query.js';

const WIDE = '(min-width: 80rem)';

function Probe() {
  return <p>{useMediaQuery(WIDE) ? 'wide' : 'narrow'}</p>;
}

/** A media query the test can flip, the way a window being resized would. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      matches,
      addEventListener: (_: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: string, listener: () => void) => {
        listeners.delete(listener);
      },
    })),
  );

  return {
    resizeTo(next: boolean) {
      stubMatchMedia(next);
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('reports whether the query matches right now', () => {
    stubMatchMedia(true);
    render(<Probe />);

    expect(screen.getByText('wide')).toBeInTheDocument();
  });

  it('follows the window as it changes', () => {
    const media = stubMatchMedia(false);
    render(<Probe />);

    expect(screen.getByText('narrow')).toBeInTheDocument();

    media.resizeTo(true);

    expect(screen.getByText('wide')).toBeInTheDocument();
  });
});
