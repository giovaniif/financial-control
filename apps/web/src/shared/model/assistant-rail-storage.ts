const KEY = 'fin.assistant-rail';

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
