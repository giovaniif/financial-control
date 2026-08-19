import type {
  CycleResponse,
  DashboardResponse,
  EstimateMode,
  HeadlineResponse,
  KpiResponse,
  UpcomingEntryResponse,
} from '@fin/contracts';

export interface MainFigures {
  headline: HeadlineResponse;
  kpis: KpiResponse[];
  upcoming: UpcomingEntryResponse[];
}

/**
 * UC-4.4 — one control, and every figure on the screen answers the same way.
 *
 * The dashboard read model is always built including estimates, so the
 * confirmed-only reading is taken from the cycle the screen already reads:
 * the API computes that one for whichever mode the header is in, which keeps
 * both readings the server's arithmetic rather than a total re-derived here.
 */
export function figuresFor(
  dashboard: DashboardResponse,
  cycle: CycleResponse | undefined,
  estimates: EstimateMode,
): MainFigures {
  const { headline, kpis, upcoming } = dashboard;

  // A cycle read still catching up describes another cycle, and half of one
  // cycle beside half of another is worse than a figure that has not moved.
  const isConfirmed =
    estimates === 'excluded' &&
    cycle?.estimates === 'excluded' &&
    cycle.month === headline.cycleMonth;

  if (!isConfirmed) {
    return { headline, kpis, upcoming };
  }

  const { chain, lowWaterMark } = cycle;

  return {
    headline: {
      ...headline,
      incoming: chain.totalIncome,
      outgoing: chain.totalOutcome,
      free: chain.netSurplus,
      lowestPoint: lowWaterMark?.balance ?? null,
      lowestPointDate: lowWaterMark?.date ?? null,
      closing: chain.closingBalance,
      // Nothing on screen is a guess any more, so the two readings agree.
      closingWithoutEstimates: chain.closingBalance,
    },
    kpis: kpis.map((kpi) => confirmedKpi(kpi, cycle)),
    upcoming: upcoming.filter((entry) => !entry.isEstimate),
  };
}

function confirmedKpi(kpi: KpiResponse, cycle: CycleResponse): KpiResponse {
  const { chain, lowWaterMark } = cycle;

  switch (kpi.label) {
    case 'Total Outcome':
      return { ...kpi, amount: chain.totalOutcome };
    case 'Expected Surplus':
      return { ...kpi, amount: chain.expectedSurplus };
    case 'Net Surplus':
      return { ...kpi, amount: chain.netSurplus };
    case 'Lowest point in cycle':
      return {
        ...kpi,
        amount: lowWaterMark?.balance ?? 0,
        // The note names the entry that took the balance there, so it has to
        // move with the figure or it explains a number nobody is looking at.
        note:
          lowWaterMark === null
            ? 'nothing scheduled yet'
            : `on ${lowWaterMark.date}, after ${lowWaterMark.description}`,
      };
    default:
      return kpi;
  }
}
