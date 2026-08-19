import type { Principal } from '../shared/principal.js';

/**
 * One proposal, as the server holds it between being shown and being applied.
 *
 * **The change never round-trips through the client.** A caller that carried
 * it back would be free to change what it said on the way, which would make
 * the confirmation a formality: the user would approve one thing and the app
 * would write another. The client carries the id and the sentence it was
 * shown, and nothing else.
 *
 * `change` is the caller's type. The store is the mechanism; what a proposal
 * is belongs to the layer that composes it, exactly as the setup
 * conversation's state does.
 */
export interface StoredProposal<TChange> {
  readonly id: string;
  /** Who it was composed for. A confirmation from anyone else is refused. */
  readonly principal: Principal;
  readonly change: TChange;
  /** Word for word what the user was shown, so a swap is detectable. */
  readonly summary: string;
  readonly proposedAt: Date;
  /** Set once it has been applied, so it cannot be applied twice. */
  readonly appliedAt: Date | undefined;
}

export interface ProposalStore<TChange> {
  load(id: string): Promise<StoredProposal<TChange> | undefined>;
  save(proposal: StoredProposal<TChange>): Promise<void>;
}
