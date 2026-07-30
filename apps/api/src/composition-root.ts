import type { FastifyInstance } from 'fastify';

import { SystemClock } from './infrastructure/clock/system-clock.js';
import { buildServer } from './interface/http/server.js';

/**
 * The one place where ports meet their implementations. Everything below this
 * file receives its dependencies through a constructor or a parameter, which is
 * what lets the layers be tested without a database, a network or a real clock.
 */
export function createApp(): FastifyInstance {
  return buildServer({ clock: new SystemClock() });
}
