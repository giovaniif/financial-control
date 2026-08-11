import { describe, expect, it } from 'vitest';

import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import type { BucketEvent } from './bucket-event.js';
import {
  applyEvent,
  BucketEvents,
  foldBalance,
  InvalidBucketEvent,
} from './bucket-event.js';

const date = LocalDate.parse('2026-08-31');
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

describe('BucketEvents guards', () => {
  it('refuses a negative override', () => {
    expect(() =>
      BucketEvents.override('e1', '2026-08', reais(-1), reais(100)),
    ).toThrow(InvalidBucketEvent);
  });

  it('refuses a correction to less than nothing', () => {
    expect(() =>
      BucketEvents.correction('e1', date, reais(-1), 'impossible'),
    ).toThrow(InvalidBucketEvent);
  });

  it.each([0, -50])('refuses a withdrawal of %s', (amount) => {
    expect(() =>
      BucketEvents.withdrawal('e1', date, reais(amount), 'why'),
    ).toThrow(InvalidBucketEvent);
  });

  it('trims the reason it stores', () => {
    const event = BucketEvents.correction('e1', date, reais(10), '  fees  ');

    expect(event.kind === 'CORRECTION' && event.reason).toBe('fees');
  });
});

describe('applyEvent', () => {
  it('refuses an event kind it does not know', () => {
    const unknown = { kind: 'TELEPORT', id: 'e1' } as unknown as BucketEvent;

    expect(() => applyEvent(Money.zero(), unknown)).toThrow(InvalidBucketEvent);
  });

  it('folds an empty log to nothing', () => {
    expect(foldBalance([]).isZero()).toBe(true);
  });
});
