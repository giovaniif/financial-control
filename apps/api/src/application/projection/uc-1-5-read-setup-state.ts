import type {
  AccountRepository,
  BucketRepository,
  RecurringTemplateRepository,
  SettingsRepository,
} from '../../domain/ports/repositories.js';

export interface SetupState {
  anchorConfigured: boolean;
  accounts: number;
  templates: number;
  buckets: number;
  /** Nothing configured and nothing created — the app as it ships. */
  isPristine: boolean;
}

/**
 * UC-1.5 — what the first run still has to do. A read model over every context
 * the checklist covers, which is why it sits in projection rather than in any
 * one of them.
 */
export class ReadSetupState {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly accounts: AccountRepository,
    private readonly templates: RecurringTemplateRepository,
    private readonly buckets: BucketRepository,
  ) {}

  async execute(): Promise<SetupState> {
    const [anchorConfigured, accounts, templates, buckets] = await Promise.all([
      this.settings.isConfigured(),
      this.accounts.findAll(),
      this.templates.findAll(),
      this.buckets.findAll(),
    ]);

    const counts = {
      accounts: accounts.length,
      templates: templates.length,
      buckets: buckets.length,
    };

    return {
      anchorConfigured,
      ...counts,
      isPristine:
        !anchorConfigured &&
        Object.values(counts).every((count) => count === 0),
    };
  }
}
