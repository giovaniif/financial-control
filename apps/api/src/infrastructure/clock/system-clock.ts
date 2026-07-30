import type { Clock } from '../../domain/ports/clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
