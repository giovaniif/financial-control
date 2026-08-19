import { describe, expect, it } from 'vitest';

import type { ModelUsage } from '../../domain/ports/language-model.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Principal } from '../../domain/shared/principal.js';
import { FakeSpendLedger } from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';

import { SpendCeiling, SpendCeilingReached } from './spend-ceiling.js';

const used = (inputTokens: number, outputTokens: number): ModelUsage => ({
  inputTokens,
  outputTokens,
});

const sole = Principal.sole();
const other = Principal.of('someone-else');

const ceilingOf = (
  ledger: FakeSpendLedger,
  maxTokensPerDay: number,
  at = '2026-08-18T09:00:00Z',
) => new SpendCeiling(ledger, FixedClock.at(at), maxTokensPerDay);

describe('SpendCeiling', () => {
  it('allows a call when nothing has been spent today', async () => {
    const ceiling = ceilingOf(new FakeSpendLedger(), 1_000);

    await expect(ceiling.check(sole)).resolves.toBeUndefined();
  });

  /**
   * Input and output are counted together: the ceiling is one number a person
   * can state, and it is the whole of what a day may cost.
   */
  it('counts input and output tokens together', async () => {
    const ledger = new FakeSpendLedger();
    const ceiling = ceilingOf(ledger, 1_000);

    await ceiling.record(sole, used(400, 250));

    expect(await ledger.spentOn(sole, LocalDate.parse('2026-08-18'))).toBe(650);
  });

  it('refuses once the day has reached the ceiling', async () => {
    const ledger = new FakeSpendLedger();
    const ceiling = ceilingOf(ledger, 1_000);

    await ceiling.record(sole, used(600, 400));

    await expect(ceiling.check(sole)).rejects.toBeInstanceOf(
      SpendCeilingReached,
    );
  });

  it('says why it is quiet and that the rest of the app still works', async () => {
    const ledger = new FakeSpendLedger();
    const ceiling = ceilingOf(ledger, 1_000);

    await ceiling.record(sole, used(1_200, 0));

    await expect(ceiling.check(sole)).rejects.toThrow(
      /Everything else in the app works without it/,
    );
  });

  /**
   * The rollover is read from the `Clock` port, so the same ledger answers
   * differently the next day without anything having to expire it.
   */
  it('starts the count again the next day', async () => {
    const ledger = new FakeSpendLedger();
    const today = ceilingOf(ledger, 1_000, '2026-08-18T23:50:00Z');
    const tomorrow = ceilingOf(ledger, 1_000, '2026-08-19T00:10:00Z');

    await today.record(sole, used(1_000, 200));

    await expect(today.check(sole)).rejects.toBeInstanceOf(SpendCeilingReached);
    await expect(tomorrow.check(sole)).resolves.toBeUndefined();
  });

  /**
   * A tautology today, because there is one principal. It is the point: a
   * global counter would need a schema change to become per-user, a keyed one
   * needs a different constant.
   */
  it('counts each principal separately', async () => {
    const ledger = new FakeSpendLedger();
    const ceiling = ceilingOf(ledger, 1_000);

    await ceiling.record(sole, used(1_000, 100));

    await expect(ceiling.check(sole)).rejects.toBeInstanceOf(
      SpendCeilingReached,
    );
    await expect(ceiling.check(other)).resolves.toBeUndefined();
  });
});
