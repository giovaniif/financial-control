import type {
  BackupDocument,
  SetupAppliedResponse,
  SetupStateResponse,
  SetupTurnRequest,
  SetupTurnResponse,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';
import type { CompleteSetup } from '../../../application/setup/compose-setup.js';
import { SetupNotComplete } from '../../../application/setup/compose-setup.js';
import type {
  ConverseSetup,
  SetupTurn,
} from '../../../application/setup/uc-1-5-converse-setup.js';
import { SetupConversationNotFound } from '../../../application/setup/uc-1-5-converse-setup.js';
import {
  LanguageModelFailed,
  LanguageModelUnavailable,
} from '../../../domain/ports/language-model.js';

interface Dependencies {
  readSetupState: ReadSetupState;
  converseSetup: ConverseSetup;
  completeSetup: CompleteSetup;
}

/** UC-1.5 — the first run: what is still missing, and the conversation. */
export function registerSetupRoutes(
  app: FastifyInstance,
  { readSetupState, converseSetup, completeSetup }: Dependencies,
): void {
  app.get('/setup', async (): Promise<SetupStateResponse> => {
    const state = await readSetupState.execute();

    return { ...state, assistantAvailable: converseSetup.isAvailable };
  });

  app.post('/setup/conversation', async (request, reply) => {
    const input = readTurnRequest(request.body);
    if (input === undefined) {
      return badRequest(
        reply,
        'message is required, and conversationId must be a string when it is present.',
      );
    }

    try {
      return toTurn(await converseSetup.execute(input));
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.post<{ Params: { id: string } }>(
    '/setup/conversation/:id/apply',
    async (request, reply) => {
      try {
        return toApplied(await completeSetup.execute(request.params.id));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );
}

function readTurnRequest(body: unknown): SetupTurnRequest | undefined {
  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;

  const message = record?.['message'];
  if (typeof message !== 'string' || message.trim() === '') return undefined;

  // A client that sends `null` for the first turn means the same as one that
  // leaves the key out, and reading the two differently would open a
  // conversation the caller thought it was continuing.
  const conversationId = record?.['conversationId'] ?? undefined;
  if (conversationId !== undefined && typeof conversationId !== 'string') {
    return undefined;
  }

  return conversationId === undefined
    ? { message }
    : { message, conversationId };
}

function toTurn(turn: SetupTurn): SetupTurnResponse {
  return {
    conversationId: turn.conversationId,
    message: turn.message,
    established: turn.established.map((record) => ({
      section: record.section,
      summary: record.summary,
    })),
    corrections: [...turn.corrections],
    nextSection: turn.nextSection ?? null,
    isComplete: turn.isComplete,
    wasRefused: turn.wasRefused,
  };
}

/**
 * Counts rather than the whole document: what the user wants confirmed is that
 * the conversation became real data, and every one of these has a screen of
 * its own to read it back from.
 */
function toApplied(document: BackupDocument): SetupAppliedResponse {
  return {
    anchorDay: document.anchor.anchorDay,
    shiftPolicy: document.anchor.shiftPolicy,
    accounts: document.accounts.length,
    templates: document.templates.length,
    cards: document.cards.length,
    buckets: document.buckets.length,
  };
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

function handle(error: unknown, reply: FastifyReply) {
  if (error instanceof SetupConversationNotFound) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof SetupNotComplete) {
    return reply.status(409).send({ error: error.message });
  }
  // 503 is the same fact `GET /setup` reports as `assistantAvailable: false`:
  // nothing is wrong, there is simply no model configured, and the client
  // falls back to the plain form. A model that was reached and failed is a
  // different situation and must not collapse into the same code.
  if (error instanceof LanguageModelUnavailable) {
    return reply.status(503).send({ error: error.message });
  }
  if (error instanceof LanguageModelFailed) {
    return reply.status(502).send({ error: error.message });
  }
  throw error;
}
