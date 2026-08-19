const KEY = 'fin.assistant-rail';

/**
 * The width at which the icon strip, the rail and the figures fit side by
 * side. Below it the rail covers the content instead of pushing it, and
 * collapsed is the state the app rests in.
 */
export const WIDE_ENOUGH_FOR_RAIL = '(min-width: 64rem)';

/**
 * Whether the chat was left open, in `localStorage` beside the transcript it
 * belongs to: a conversation that survives a reload into a rail that does not
 * is half a memory.
 */
export function loadRailOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === 'open';
  } catch {
    return false;
  }
}

export function saveRailOpen(isOpen: boolean): void {
  try {
    localStorage.setItem(KEY, isOpen ? 'open' : 'closed');
  } catch {
    // A full or blocked store costs the preference, never the rail.
  }
}
