/**
 * Selects a field's contents when it takes focus.
 *
 * For a field pre-filled with a figure the user is there to *change*, the
 * first keystroke should replace it. Without this, typing runs on from what
 * was already there — `2.160,00` plus `3.000,00` becomes `2.160,003.000,00`,
 * which no parser accepts and which reads as the user's typo rather than the
 * form's.
 */
export function selectAll(event: { currentTarget: HTMLInputElement }): void {
  event.currentTarget.select();
}
