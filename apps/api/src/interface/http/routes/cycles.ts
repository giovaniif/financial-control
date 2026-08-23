import type {
  CycleResponse,
  CycleWindowResponse,
  EstimateMode,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type {
  CycleView,
  ReadCycle,
} from '../../../application/budgeting/uc-3-1-read-cycle.js';
import { UnknownMonth } from '../../../application/budgeting/uc-3-1-read-cycle.js';
import type { ListCycles } from '../../../application/budgeting/uc-3-3-list-cycles.js';
import { Estimates } from '../../../domain/budgeting/cycle.js';

interface Dependencies {
  readCycle: ReadCycle;
  listCycles: ListCycles;
}

/**
 * The global estimates toggle is a query parameter, not a second endpoint —
 * both readings come from one code path in the domain.
 */
export function readEstimates(value: unknown): Estimates | undefined {
  if (value === undefined || value === 'included') {
    return Estimates.Included;
  }
  if (value === 'excluded') {
    return Estimates.Excluded;
  }
  return undefined;
}

/** The mode as the contract names it. */
export function toEstimateMode(estimates: Estimates): EstimateMode {
  return estimates === Estimates.Included ? 'included' : 'excluded';
}

export function toResponse(view: CycleView): CycleResponse {
  return {
    id: view.id,
    month: view.month,
    label: view.label,
    start: view.start,
    end: view.end,
    status: view.status,
    estimates: toEstimateMode(view.estimates),
    chain: {
      openingBalance: view.chain.openingBalance.cents,
      totalIncome: view.chain.totalIncome.cents,
      totalOutcome: view.chain.totalOutcome.cents,
      variables: view.chain.variables.cents,
      surplus: view.chain.surplus.cents,
      expectedSurplus: view.chain.expectedSurplus.cents,
      allocations: view.chain.allocations.cents,
      netSurplus: view.chain.netSurplus.cents,
      closingBalance: view.chain.closingBalance.cents,
    },
    entries: view.entries.map((entry) => ({
      id: entry.id,
      description: entry.description,
      kind: entry.kind,
      dueDate: entry.dueDate,
      planned: entry.plannedCents,
      actual: entry.actualCents ?? null,
      status: entry.status,
      isEstimate: entry.isEstimate,
      isOverridden: entry.isOverridden,
      variance: entry.varianceCents ?? null,
      balance: entry.balanceCents,
    })),
    lowWaterMark:
      view.lowWaterMark === undefined
        ? null
        : {
            balance: view.lowWaterMark.balanceCents,
            date: view.lowWaterMark.date,
            description: view.lowWaterMark.description,
          },
    firstNegativeDate: view.firstNegativeDate ?? null,
  };
}

/** UC-3.1, UC-3.2 — one cycle in full. */
export function registerCycleRoutes(
  app: FastifyInstance,
  { readCycle, listCycles }: Dependencies,
): void {
  // Registered before /cycles/:month so it is not swallowed by the parameter.
  app.get<{ Querystring: { estimates?: string } }>(
    '/cycles',
    async (request, reply) => {
      const estimates = readEstimates(request.query.estimates);
      if (estimates === undefined) {
        return badRequest(reply, "estimates must be 'included' or 'excluded'.");
      }

      const window = await listCycles.rollingWindow(estimates);
      const body: CycleWindowResponse = {
        estimates: toEstimateMode(estimates),
        cycles: window.map((cycle) => ({
          month: cycle.month,
          label: cycle.label,
          start: cycle.start,
          end: cycle.end,
          status: cycle.status,
          position: cycle.position,
          openingBalance: cycle.openingBalanceCents,
          closingBalance: cycle.closingBalanceCents,
          netSurplus: cycle.netSurplusCents,
          isMaterialised: cycle.isMaterialised,
        })),
      };
      return body;
    },
  );

  app.get<{ Params: { month: string }; Querystring: { estimates?: string } }>(
    '/cycles/:month',
    async (request, reply) => {
      const estimates = readEstimates(request.query.estimates);
      if (estimates === undefined) {
        return badRequest(reply, "estimates must be 'included' or 'excluded'.");
      }

      try {
        return toResponse(
          await readCycle.byMonth(request.params.month, estimates),
        );
      } catch (error) {
        if (error instanceof UnknownMonth) {
          return badRequest(reply, error.message);
        }
        throw error;
      }
    },
  );
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}
