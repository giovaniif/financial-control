import { Principal } from '../../domain/shared/principal.js';

/**
 * Whose request this is.
 *
 * There is one user and no authentication (`docs/USE_CASES.md` §7), so today
 * this is a constant. It is a function in the interface layer anyway because
 * identity is **ambient**: it has to be supplied by whatever knows who is
 * calling. The day a session or a header carries it, this is the only file
 * that changes — and nothing below it ever reads identity out of a body, a
 * query string or a model's tool arguments.
 */
export function principalOf(): Principal {
  return Principal.sole();
}
