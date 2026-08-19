import { randomUUID } from 'node:crypto';

import type { IdSource } from '../../domain/ports/id-source.js';

/** The one place a random identifier is generated. */
export class UuidIdSource implements IdSource {
  next(): string {
    return randomUUID();
  }
}
