import { Readable } from 'node:stream';

import type {
  AssistantMessageRequest,
  AssistantProposalResponse,
  AssistantReadResponse,
  AssistantStreamEvent,
  AssistantTurnResponse,
  ProposalAppliedResponse,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type {
  AssistantConversation,
  AssistantTurnEvent,
} from '../../../application/assistant/assistant-conversation.js';
import {
  AssistantConversationNotFound,
  ConversationTooLong,
  QuestionTooLong,
} from '../../../application/assistant/assistant-conversation.js';
import type {
  ApplyProposal,
  ProposalApplied,
} from '../../../application/assistant/uc-8-apply-proposal.js';
import {
  ProposalAlreadyApplied,
  ProposalMismatch,
  ProposalNotFound,
  ProposalNotYours,
} from '../../../application/assistant/uc-8-apply-proposal.js';
import type {
  AssistantAnswer,
  ProposalOffer,
} from '../../../application/assistant/uc-8-ask-assistant.js';
import { EmptyQuestion } from '../../../application/assistant/uc-8-ask-assistant.js';
import {
  LanguageModelFailed,
  LanguageModelUnavailable,
} from '../../../domain/ports/language-model.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import { principalOf } from '../principal.js';
import type { SpendGuard } from '../rate-limit.js';

interface Dependencies {
  converseAssistant: AssistantConversation;
  applyProposal: ApplyProposal;
  /** Applying a proposal writes to the database; asking costs a model call. */
  spendGuard: SpendGuard;
}

/** UC-8 — the assistant: one message in, and the answer as it is written. */
export function registerAssistantRoutes(
  app: FastifyInstance,
  { converseAssistant, applyProposal, spendGuard }: Dependencies,
): void {
  app.post(
    '/assistant/messages',
    { onRequest: spendGuard },
    async (request, reply) => {
      const input = readMessage(request.body);
      if (input === undefined) {
        return badRequest(
          reply,
          'message is required, and conversationId must be a string when it is present.',
        );
      }

      const turn = converseAssistant.converse(principalOf(), input);

      // Pulled before the headers go out: everything that can fail before the
      // first token — no model configured, an unknown conversation, a question
      // past its cap — still answers with a status code rather than a 200 with
      // a failure buried inside it.
      let opening;
      try {
        opening = await turn.next();
      } catch (error) {
        return handle(error, reply);
      }

      const body = Readable.from(frames(opening, turn));
      // The client hung up: closing the stream closes the generator behind it,
      // and with it the model call, rather than paying for output nobody will
      // read. Said here rather than left to Fastify's own teardown of a payload
      // stream, because it is the point of the route and not an implementation
      // detail of the framework.
      reply.raw.on('close', () => {
        body.destroy();
      });

      return reply
        .header('content-type', 'text/event-stream')
        .header('cache-control', 'no-cache')
        .send(body);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/assistant/proposals/:id/apply',
    async (request, reply) => {
      const summary = readSummary(request.body);
      if (summary === undefined) {
        return badRequest(
          reply,
          'summary is required — the sentence the proposal was shown as.',
        );
      }

      try {
        return toApplied(
          await applyProposal.confirm(principalOf(), {
            proposalId: request.params.id,
            summary,
          }),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );
}

/**
 * The turn as server-sent events.
 *
 * One code path: these are the port's own events, renamed. There is no
 * second, non-streaming way to ask — a caller wanting the whole answer reads
 * the terminal `turn` frame.
 */
async function* frames(
  opening: IteratorResult<AssistantTurnEvent, void>,
  rest: AsyncGenerator<AssistantTurnEvent, void>,
): AsyncGenerator<string> {
  try {
    if (opening.done === true) return;

    yield frame(toStreamEvent(opening.value));
    for await (const event of rest) yield frame(toStreamEvent(event));
  } catch (error) {
    // The headers are already out, so what would have been a status code can
    // only be told as an event.
    yield frame(toStreamError(error));
  } finally {
    // Reached both when the answer is finished and when the client hung up
    // mid-frame; only in the second case is there still a model call to end.
    await rest.return(undefined);
  }
}

function frame(event: AssistantStreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function toStreamEvent(event: AssistantTurnEvent): AssistantStreamEvent {
  switch (event.kind) {
    case 'text':
      return { event: 'text', data: { delta: event.delta } };
    case 'read':
      return { event: 'tool', data: toRead(event.read) };
    case 'turn':
      return {
        event: 'turn',
        data: toTurn(event.conversationId, event.answer),
      };
  }
}

function toStreamError(error: unknown): AssistantStreamEvent {
  return {
    event: 'error',
    data: {
      error:
        error instanceof DomainError
          ? error.message
          : 'The assistant stopped before it had answered.',
      status: statusOf(error) ?? 500,
    },
  };
}

function toTurn(
  conversationId: string,
  answer: AssistantAnswer,
): AssistantTurnResponse {
  return {
    conversationId,
    message: answer.message,
    reads: answer.reads.map(toRead),
    proposals: answer.proposals.map(toProposal),
    wasRefused: answer.wasRefused,
    hitReadLimit: answer.hitReadLimit,
  };
}

function toRead(read: {
  tool: string;
  failure: string | undefined;
}): AssistantReadResponse {
  return { tool: read.tool, failure: read.failure ?? null };
}

/**
 * The id and the sentence, never what the change would write: the client
 * renders this and confirms it with the same sentence, so what it approves and
 * what the server holds cannot come apart.
 */
function toProposal(offer: ProposalOffer): AssistantProposalResponse {
  return {
    id: offer.id,
    kind: offer.change.kind,
    summary: offer.summary,
    proposedAt: offer.proposedAt.toISOString(),
  };
}

function toApplied(applied: ProposalApplied): ProposalAppliedResponse {
  return {
    proposalId: applied.proposalId,
    kind: applied.kind,
    summary: applied.summary,
  };
}

/**
 * A message and, once there is one, the id of the conversation it belongs to.
 * There is deliberately nothing else to read: a transcript sent from outside
 * would let the caller decide what the model was shown and what it cost.
 */
function readMessage(body: unknown): AssistantMessageRequest | undefined {
  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;

  const message = record?.['message'];
  if (typeof message !== 'string' || message.trim() === '') return undefined;

  // `null` on the first message means the same as leaving the key out, and
  // reading the two differently would open a conversation the caller thought
  // it was continuing.
  const conversationId = record?.['conversationId'] ?? undefined;
  if (conversationId !== undefined && typeof conversationId !== 'string') {
    return undefined;
  }

  return conversationId === undefined
    ? { message }
    : { message, conversationId };
}

function readSummary(body: unknown): string | undefined {
  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;

  const summary = record?.['summary'];
  return typeof summary === 'string' && summary.trim() !== ''
    ? summary
    : undefined;
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

/**
 * The one place a status is decided, so the code a request fails with and the
 * code an interrupted stream reports are the same fact.
 *
 * 503 and 502 match the setup routes exactly: no model configured is a state
 * the app is expected to be in, while a model that was reached and failed is
 * a different situation and must not collapse into the same code.
 */
function statusOf(error: unknown): number | undefined {
  if (error instanceof EmptyQuestion || error instanceof QuestionTooLong) {
    return 400;
  }
  if (
    error instanceof AssistantConversationNotFound ||
    error instanceof ProposalNotFound ||
    // Whose a proposal is, is not something a caller gets to learn.
    error instanceof ProposalNotYours
  ) {
    return 404;
  }
  if (
    error instanceof ConversationTooLong ||
    error instanceof ProposalMismatch ||
    error instanceof ProposalAlreadyApplied
  ) {
    return 409;
  }
  if (error instanceof LanguageModelUnavailable) return 503;
  if (error instanceof LanguageModelFailed) return 502;

  // Applying routes into the interactor that owns the change, so anything
  // else it refuses is the domain refusing well-formed input: a conflict with
  // the state, not a malformed request.
  return error instanceof DomainError ? 409 : undefined;
}

function handle(error: unknown, reply: FastifyReply) {
  const status = statusOf(error);
  if (status === undefined || !(error instanceof DomainError)) throw error;

  return reply.status(status).send({ error: error.message });
}
