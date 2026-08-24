/**
 * How long the shell's surfaces take to arrive and leave, and the curve they
 * follow. One pair, shared by the nav drawer and the chat rail, because they
 * are the same gesture from the user's side — a panel entering from an edge —
 * and two panels easing differently reads as a bug rather than as variety.
 *
 * The curve starts fast and settles slowly, so the panel feels caught rather
 * than launched. Anyone who has asked not to be moved gets no transition at
 * all; every consumer pairs these with `motion-reduce:transition-none`.
 */
export const MOTION_MS = 220;

export const EASE_SHEET = 'cubic-bezier(0.32, 0.72, 0, 1)';
