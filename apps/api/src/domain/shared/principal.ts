import { DomainError } from './domain-error.js';

export class InvalidPrincipal extends DomainError {}

/** The only user this app has, until it has more than one. */
const SOLE_USER = 'sole-user';

/**
 * Whose request this is.
 *
 * There is one user today, so every comparison against {@link Principal.sole}
 * holds trivially. The type exists anyway because identity has to be
 * **ambient**: supplied by whatever knows who is calling, never read out of a
 * request body and never out of a model's tool arguments. Anything that
 * outlives a single request — a proposal waiting to be confirmed — is stamped
 * with it now, because adding identity to those later is a migration rather
 * than a different constant.
 */
export class Principal {
  private constructor(readonly id: string) {}

  static of(id: string): Principal {
    const trimmed = id.trim();
    if (trimmed === '') {
      throw new InvalidPrincipal('A principal needs an id.');
    }
    return new Principal(trimmed);
  }

  static sole(): Principal {
    return new Principal(SOLE_USER);
  }

  equals(other: Principal): boolean {
    return this.id === other.id;
  }
}
