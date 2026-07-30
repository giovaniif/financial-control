import { randomUUID } from 'node:crypto';

export const brokenId = (): string => randomUUID();
