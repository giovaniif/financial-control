/**
 * The base of every error the domain raises. Errors are domain types, never
 * strings: the interface layer maps them to status codes, and the domain never
 * knows about HTTP.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
