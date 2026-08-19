const KEY = 'fin.setup-skipped';

/**
 * Whether the user chose to leave the first-run wizard.
 *
 * Session-scoped on purpose. There is no user record to persist it on, and an
 * app that is still genuinely empty should offer setup again next launch — the
 * escape hatch is that skipping leaves the app fully usable, not that the
 * offer goes away for good.
 */
export function hasSkippedSetup(): boolean {
  return sessionStorage.getItem(KEY) === 'true';
}

export function skipSetup(): void {
  sessionStorage.setItem(KEY, 'true');
}

export function unskipSetup(): void {
  sessionStorage.removeItem(KEY);
}
