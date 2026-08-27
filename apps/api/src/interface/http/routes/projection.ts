import type {
  DashboardResponse,
  WealthProjectionResponse,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { ManageBuckets } from '../../../application/goals/uc-6-manage-buckets.js';
import type { BuildDashboard } from '../../../application/projection/uc-4-build-dashboard.js';
import type { ProjectWealth } from '../../../application/projection/uc-7-project-wealth.js';
import { InvalidAnchor } from '../../../domain/budgeting/cycle-ref.js';
import { InvalidPercentage } from '../../../domain/shared/percentage.js';

import { readEstimates, toEstimateMode } from './cycles.js';

interface Dependencies {
  buildDashboard: BuildDashboard;
  projectWealth: ProjectWealth;
  manageBuckets: ManageBuckets;
}

/** UC-4 and UC-7 — the two screens that answer the app's two questions. */
export function registerProjectionRoutes(
  app: FastifyInstance,
  { buildDashboard, projectWealth, manageBuckets }: Dependencies,
): void {
  app.get<{ Querystring: { month?: string; estimates?: string } }>(
    '/dashboard',
    async (request, reply) => {
      // The same toggle the cycle route reads, read the same way: one control
      // switches every figure in the app, so it cannot be two parsers.
      const estimates = readEstimates(request.query.estimates);
      if (estimates === undefined) {
        return reply
          .status(400)
          .send({ error: "estimates must be 'included' or 'excluded'." });
      }

      try {
        const view = await buildDashboard.build(request.query.month, estimates);
        const body: DashboardResponse = {
          today: view.today,
          currentCycleMonth: view.currentCycleMonth,
          estimates: toEstimateMode(view.estimates),
          headline: {
            cycleMonth: view.headline.cycleMonth,
            cycleLabel: view.headline.cycleLabel,
            range: view.headline.range,
            incoming: view.headline.incomingCents,
            outgoing: view.headline.outgoingCents,
            free: view.headline.freeCents,
            closing: view.headline.closingCents,
            closingWithoutEstimates: view.headline.closingWithoutEstimatesCents,
          },
          kpis: view.kpis.map((kpi) => ({
            label: kpi.label,
            amount: kpi.amountCents,
            note: kpi.note,
          })),
          progress: {
            dayOfCycle: view.progress.dayOfCycle,
            cycleLength: view.progress.cycleLength,
            timePercent: view.progress.timePercent,
            spent: view.progress.spentCents,
            plannedOut: view.progress.plannedOutCents,
            spentPercent: view.progress.spentPercent,
          },
          variance: view.varianceCents,
          upcoming: view.upcoming.map((entry) => ({
            id: entry.id,
            cycleMonth: entry.cycleMonth,
            description: entry.description,
            dueDate: entry.dueDate,
            amount: entry.amountCents,
            isEstimate: entry.isEstimate,
            isOverdue: entry.isOverdue,
            daysLate: entry.daysLate,
            isOverridden: entry.isOverridden,
            projectedAmount: entry.projectedAmountCents,
          })),
        };
        return body;
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.get<{ Querystring: { month?: string; yields?: string } }>(
    '/wealth',
    async (request, reply) => {
      try {
        // The contributions the projection compounds are whatever the rules
        // would allocate in the given cycle, so the two screens agree.
        const month = request.query.month;
        const contributionsCents: Record<string, number> = {};

        if (month !== undefined) {
          const preview = await manageBuckets.previewAllocation(month);
          for (const funding of preview.fundings) {
            contributionsCents[funding.bucketId] = funding.fundedCents;
          }
        }

        const yieldOverrides = readYields(request.query.yields);
        const view = await projectWealth.project({
          contributionsCents,
          ...(yieldOverrides === undefined ? {} : { yieldOverrides }),
        });

        const body: WealthProjectionResponse = {
          horizons: view.horizons.map((horizon) => ({
            years: horizon.years,
            total: horizon.totalCents,
            byBucket: horizon.byBucket.map((entry) => ({
              bucketId: entry.bucketId,
              name: entry.name,
              amount: entry.amountCents,
            })),
          })),
          buckets: view.buckets.map((bucket) => ({
            bucketId: bucket.bucketId,
            name: bucket.name,
            isGoal: bucket.isGoal,
            contributionPerCycle: bucket.contributionPerCycleCents,
            expectedYieldPercent: bucket.expectedYieldPercent,
            reachesTargetIn: bucket.reachesTargetIn ?? null,
            target: bucket.targetCents ?? null,
            targetDate: bucket.targetDate ?? null,
            isOnTrack: bucket.isOnTrack ?? null,
            contributionToCatchUp: bucket.contributionToCatchUpCents ?? null,
            inFiveYears: bucket.inFiveYearsCents ?? null,
            inTenYears: bucket.inTenYearsCents ?? null,
          })),
          retirement:
            view.retirement === undefined
              ? null
              : {
                  bucketId: view.retirement.bucketId,
                  name: view.retirement.name,
                  balanceAtHorizon: view.retirement.balanceAtHorizonCents,
                  sustainableMonthlyIncome:
                    view.retirement.sustainableMonthlyIncomeCents,
                },
        };
        return body;
      } catch (error) {
        return handle(error, reply);
      }
    },
  );
}

/** `reserve:10,retirement:8` — a yield per bucket, for testing assumptions. */
function readYields(
  raw: string | undefined,
): Record<string, number> | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }

  const overrides: Record<string, number> = {};
  for (const pair of raw.split(',')) {
    const [bucketId, percent] = pair.split(':');
    if (bucketId !== undefined && percent !== undefined) {
      overrides[bucketId] = Number(percent);
    }
  }
  return overrides;
}

function handle(error: unknown, reply: FastifyReply) {
  if (error instanceof InvalidAnchor || error instanceof InvalidPercentage) {
    return reply.status(400).send({ error: error.message });
  }
  throw error;
}
