import { describe, expect, it } from 'vitest';

import { LocalDate } from '../../domain/shared/local-date.js';
import { Principal } from '../../domain/shared/principal.js';

import { InMemorySpendLedger } from './in-memory-spend-ledger.js';

const sole = Principal.sole();
const other = Principal.of('someone-else');
const day = (iso: string) => LocalDate.parse(iso);

describe('InMemorySpendLedger', () => {
  it('reports nothing before anything has been spent', async () => {
    const ledger = new InMemorySpendLedger();

    expect(await ledger.spentOn(sole, day('2026-08-18'))).toBe(0);
  });

  it('adds up every call made on the same day', async () => {
    const ledger = new InMemorySpendLedger();

    await ledger.record(sole, day('2026-08-18'), {
      inputTokens: 900,
      outputTokens: 100,
    });
    await ledger.record(sole, day('2026-08-18'), {
      inputTokens: 40,
      outputTokens: 10,
    });

    expect(await ledger.spentOn(sole, day('2026-08-18'))).toBe(1_050);
  });

  /**
   * The day is the caller's, read from the `Clock` port. Nothing here expires
   * anything: a row for a day that is no longer today simply answers zero.
   */
  it('reports nothing for a day that is not the one it holds', async () => {
    const ledger = new InMemorySpendLedger();

    await ledger.record(sole, day('2026-08-18'), {
      inputTokens: 900,
      outputTokens: 100,
    });

    expect(await ledger.spentOn(sole, day('2026-08-19'))).toBe(0);
  });

  it('starts the count again when a new day is recorded', async () => {
    const ledger = new InMemorySpendLedger();

    await ledger.record(sole, day('2026-08-18'), {
      inputTokens: 900,
      outputTokens: 100,
    });
    await ledger.record(sole, day('2026-08-19'), {
      inputTokens: 10,
      outputTokens: 5,
    });

    expect(await ledger.spentOn(sole, day('2026-08-19'))).toBe(15);
    expect(await ledger.spentOn(sole, day('2026-08-18'))).toBe(0);
  });

  it('keeps one count per principal', async () => {
    const ledger = new InMemorySpendLedger();

    await ledger.record(sole, day('2026-08-18'), {
      inputTokens: 900,
      outputTokens: 100,
    });

    expect(await ledger.spentOn(other, day('2026-08-18'))).toBe(0);
  });
});
