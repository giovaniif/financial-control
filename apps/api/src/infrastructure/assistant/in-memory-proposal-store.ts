import type {
  ProposalStore,
  StoredProposal,
} from '../../domain/ports/proposal-store.js';

/**
 * Proposals waiting to be confirmed, held for as long as the process runs.
 *
 * Deliberately not persisted: a proposal is worth one conversation, and an
 * API restart costs the user asking again — nothing, because a proposal has
 * written nothing. Its value is also perishable, since it was composed
 * against figures that move: a table of them would outlive its usefulness and
 * would have to be pruned by something.
 */
export class InMemoryProposalStore<TChange> implements ProposalStore<TChange> {
  private readonly rows = new Map<string, StoredProposal<TChange>>();

  load(id: string): Promise<StoredProposal<TChange> | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  save(proposal: StoredProposal<TChange>): Promise<void> {
    this.rows.set(proposal.id, proposal);
    return Promise.resolve();
  }
}
