import type {
  Cents,
  DashboardResponse,
  HeadlineResponse,
  KpiResponse,
  UpcomingEntryResponse,
} from '@fin/contracts';

export interface MainFigures {
  headline: HeadlineResponse;
  kpis: KpiResponse[];
  upcoming: UpcomingEntryResponse[];
  /** UC-3.6 — `null` for a projected cycle, which has none. */
  variance: Cents | null;
}

/**
 * UC-4.4 — one control, and every figure on the screen answers the same way.
 *
 * The dashboard is built for whichever mode the header is in, so there is
 * nothing to reconcile here. This existed to splice a confirmed reading out of
 * the cycle route while the dashboard was only built one way; assembling one
 * screen's numbers from two endpoints is the drift the read models exist to
 * prevent.
 */
export function figuresFor(dashboard: DashboardResponse): MainFigures {
  const { headline, kpis, upcoming, variance } = dashboard;

  return { headline, kpis, upcoming, variance };
}
