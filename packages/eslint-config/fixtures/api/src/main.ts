import { SystemClock } from './infrastructure/clock/system-clock.js';
import { route } from './interface/http/legal-route.js';
import { start } from './start.js';

export const boot = (): string =>
  `${start()} ${new SystemClock().now().toISOString()} ${String(route().cents)}`;
