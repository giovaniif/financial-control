import type {
  AnchorChangeRequest,
  AnchorSettingsResponse,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type {
  AnchorSettings,
  ConfigurePaydayAnchor,
} from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import { AnchorChangeWouldOrphanEntries } from '../../../application/budgeting/uc-1-1-configure-payday-anchor.js';
import { InvalidAnchor } from '../../../domain/budgeting/cycle-ref.js';

interface Dependencies {
  configureAnchor: ConfigurePaydayAnchor;
}

const POLICIES = new Set(['PRECEDING', 'FOLLOWING']);

/** The rolling window the app holds — see UC-1.1. */
const WINDOW = 12;

/** Narrows an unknown body without trusting it. */
function readAnchorRequest(body: unknown): AnchorSettings | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const { anchorDay, shiftPolicy } = body as Partial<AnchorChangeRequest>;
  if (typeof anchorDay !== 'number' || typeof shiftPolicy !== 'string') {
    return undefined;
  }
  if (!POLICIES.has(shiftPolicy)) {
    return undefined;
  }
  return { anchorDay, shiftPolicy };
}

/** UC-1.1 — read the payday anchor, preview a change, and apply it. */
export function registerSettingsRoutes(
  app: FastifyInstance,
  { configureAnchor }: Dependencies,
): void {
  app.get('/settings/anchor', async (): Promise<AnchorSettingsResponse> =>
    configureAnchor.read(),
  );

  /**
   * What a proposed anchor would make the coming cycles look like, without
   * saving it. The first run needs this before anything has been configured,
   * which is why it is separate from the change preview: that one reports the
   * impact on existing entries, and a new app has none.
   */
  app.post('/settings/anchor/resolve', async (request, reply) => {
    const proposed = readAnchorRequest(request.body);
    if (proposed === undefined) {
      return badRequest(reply, 'anchorDay and shiftPolicy are required.');
    }

    try {
      const cycles = await configureAnchor.resolveWindow(proposed, WINDOW);
      return { cycles: [...cycles] };
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.post('/settings/anchor/preview', async (request, reply) => {
    const proposed = readAnchorRequest(request.body);
    if (proposed === undefined) {
      return badRequest(reply, 'anchorDay and shiftPolicy are required.');
    }

    try {
      const preview = await configureAnchor.preview(proposed);
      return { ...preview, shifts: [...preview.shifts] };
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.put('/settings/anchor', async (request, reply) => {
    const proposed = readAnchorRequest(request.body);
    if (proposed === undefined) {
      return badRequest(reply, 'anchorDay and shiftPolicy are required.');
    }

    try {
      const applied = await configureAnchor.change(proposed);
      return { ...applied, shifts: [...applied.shifts] };
    } catch (error) {
      return handle(error, reply);
    }
  });
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

/**
 * Domain errors become status codes here; the domain never knows about HTTP.
 * An orphaning change is a conflict, not bad input — the request is valid, the
 * current data just cannot accommodate it.
 */
function handle(error: unknown, reply: FastifyReply) {
  if (error instanceof InvalidAnchor) {
    return badRequest(reply, error.message);
  }
  if (error instanceof AnchorChangeWouldOrphanEntries) {
    return reply.status(409).send({
      error: error.message,
      orphanedEntries: error.orphanedEntries,
    });
  }
  throw error;
}
