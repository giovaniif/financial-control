import { SystemClock } from '../../infrastructure/clock/system-clock.js';

export const brokenNow = (): Date => new SystemClock().now();
