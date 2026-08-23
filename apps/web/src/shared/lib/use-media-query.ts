import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, as state a component can branch on.
 *
 * Layout is Tailwind's job wherever the difference is only where things sit.
 * This is for the cases where it is not: a panel that is a column beside the
 * figures on a wide screen and would crowd them on a narrow one has to render
 * differently, not just move.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);

      return () => {
        list.removeEventListener('change', notify);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
  );
}
