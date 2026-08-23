/**
 * The assistant panel holds its own draft, so a question raised elsewhere on
 * the screen is handed to it the way a user would: written into its box, as
 * an edit React sees, and left there to be sent or reworded. Nothing is asked
 * on the user's behalf — the question is offered, never submitted.
 */
export function handToAssistant(
  panel: HTMLElement | null,
  question: string,
): void {
  const box = panel?.querySelector('textarea') ?? null;
  if (box === null) {
    return;
  }

  // React tracks the value it last wrote, and skips the change event for a
  // value it believes is already there. Writing through the prototype's own
  // setter is what makes this read as a real edit rather than nothing at all.
  // The setter is invoked with `.call(box)`, which supplies the very `this`
  // the unbound-method rule guards against losing.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const write = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  write?.call(box, question);
  box.dispatchEvent(new Event('input', { bubbles: true }));

  box.focus();
}
