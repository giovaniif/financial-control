import type { PrismaClient } from '@prisma/client';

import { PaydayAnchor } from '../../domain/budgeting/cycle-ref.js';
import type { SettingsRepository } from '../../domain/ports/repositories.js';

/** One user, so exactly one settings row. */
const SINGLETON = 'singleton';

/** Salary on the 5th, moving back off a closed bank — see UC-1.1. */
const DEFAULT_ANCHOR_DAY = 5;

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async load(): Promise<PaydayAnchor> {
    const row = await this.prisma.settings.findUnique({
      where: { id: SINGLETON },
    });

    if (row === null) {
      return PaydayAnchor.of(DEFAULT_ANCHOR_DAY, 'PRECEDING');
    }
    return PaydayAnchor.of(row.anchorDay, row.shiftPolicy);
  }

  /**
   * The row is only ever written by an explicit change, so its existence is
   * the record that someone chose the anchor rather than inherited the default.
   */
  async isConfigured(): Promise<boolean> {
    const row = await this.prisma.settings.findUnique({
      where: { id: SINGLETON },
      select: { id: true },
    });

    return row !== null;
  }

  async save(anchor: PaydayAnchor): Promise<void> {
    const data = {
      anchorDay: anchor.dayOfMonth,
      shiftPolicy: anchor.shiftPolicy,
    };

    await this.prisma.settings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...data },
      update: data,
    });
  }
}
