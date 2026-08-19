/**
 * What the first run still has to do — UC-1.5. `anchorConfigured` is tracked
 * separately from the anchor value because the anchor always reads back a
 * default, so its value can never say whether anyone chose it.
 */
export interface SetupStateResponse {
  anchorConfigured: boolean;
  accounts: number;
  cards: number;
  templates: number;
  buckets: number;
  /** Nothing configured and nothing created — the app as it ships. */
  isPristine: boolean;
}
