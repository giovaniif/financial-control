import rateLimit from '@fastify/rate-limit';
import type {
  FastifyInstance,
  FastifyPluginAsync,
  onRequestAsyncHookHandler,
} from 'fastify';

/** How many requests one caller gets, and over how long. */
export interface SpendWindow {
  readonly max: number;
  readonly windowMs: number;
}

/**
 * The two windows a money-spending route is held to.
 *
 * They catch different things, which is why there are two: `burst` stops a
 * hot loop within seconds, and `daily` bounds the worst case even when every
 * short window is respected — a client retrying politely once a minute all
 * day is still spending all day.
 *
 * The values live beside the other cost controls, not here — see
 * `infrastructure/anthropic/models.ts`, where which model answers and how
 * much it may write already are.
 */
export interface SpendRateLimits {
  readonly burst: SpendWindow;
  readonly daily: SpendWindow;
}

/** Applied to a route as `onRequest`; one hook per window, in order. */
export type SpendGuard = onRequestAsyncHookHandler[];

/**
 * The guard both money-spending routes share.
 *
 * **One budget across both routes, because it is one cost.** A client looping
 * over the assistant and a client looping over the setup conversation spend
 * the same money, and bounding each separately would bound the day at twice
 * whatever the daily figure says.
 *
 * Each window is registered in its own scope on purpose: the plugin runs at
 * most once per request per registration, so two windows stacked on one
 * registration would leave the second silently doing nothing.
 */
export async function buildSpendGuard(
  app: FastifyInstance,
  limits: SpendRateLimits,
): Promise<SpendGuard> {
  const guard: SpendGuard = [];

  for (const window of [limits.burst, limits.daily]) {
    const registerWindow: FastifyPluginAsync = async (scope) => {
      await scope.register(rateLimit, { global: false });

      guard.push(
        scope.rateLimit({
          max: window.max,
          timeWindow: window.windowMs,
          errorResponseBuilder: tooManyRequests,
        }),
      );
    };

    await app.register(registerWindow);
  }

  return guard;
}

const MILLISECONDS = 1_000;
const A_MINUTE = 60;
const AN_HOUR = 60 * A_MINUTE;
const A_DAY = 24 * AN_HOUR;

/**
 * The wait, in the language the screens are written in.
 *
 * The plugin humanises its own `after` through `@lukeed/ms`, which speaks
 * only English — so the raw `ttl` it hands over alongside it is read instead,
 * rounded up to seconds exactly as the plugin rounds it for the `retry-after`
 * header. Deriving both from the same figure the same way is what keeps the
 * header and the sentence from disagreeing.
 */
export function describeWait(seconds: number): string {
  if (seconds < A_MINUTE) {
    // A window all but elapsed still asks for a wait: "em 0 segundos" reads
    // as a refusal with nothing to do about it.
    return count(Math.max(1, Math.ceil(seconds)), 'segundo');
  }
  if (seconds < AN_HOUR) {
    return count(Math.ceil(seconds / A_MINUTE), 'minuto');
  }
  if (seconds < A_DAY) {
    return count(Math.ceil(seconds / AN_HOUR), 'hora');
  }

  return count(Math.ceil(seconds / A_DAY), 'dia');
}

function count(amount: number, unit: string): string {
  return `${String(amount)} ${unit}${amount === 1 ? '' : 's'}`;
}

/**
 * The `{ error }` shape every other route answers a refusal with. The status
 * is carried on the object rather than in it: Fastify reads it to set the
 * code, and leaving it non-enumerable keeps it out of the body.
 */
function tooManyRequests(_request: unknown, context: { ttl: number }) {
  const body = {
    error: `Requisições demais ao assistente. Tente de novo em ${describeWait(
      Math.ceil(context.ttl / MILLISECONDS),
    )}.`,
  };

  return Object.defineProperty(body, 'statusCode', {
    value: 429,
    enumerable: false,
  });
}
