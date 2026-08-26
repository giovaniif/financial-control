import type { DashboardResponse } from '@fin/contracts';

export const dashboard = (): DashboardResponse => ({
  today: '2026-08-19',
  currentCycleMonth: '2026-08',
  estimates: 'included',
  headline: {
    cycleMonth: '2026-09',
    cycleLabel: 'Setembro de 2026',
    range: '4 set – 4 out',
    incoming: 1_800_000,
    outgoing: 911_000,
    free: 355_600,
    closing: 355_600,
    closingWithoutEstimates: 505_600,
  },
  variance: null,
  kpis: [
    { label: 'Total Outcome', amount: 911_000, note: 'everything out' },
    { label: 'Expected Surplus', amount: 889_000, note: 'to allocate' },
    { label: 'Net Surplus', amount: 355_600, note: 'free cash' },
    {
      label: 'Lowest point in cycle',
      amount: 200_000,
      note: 'on 2026-09-28, after Contractor Costs',
    },
  ],
  progress: {
    dayOfCycle: 6,
    cycleLength: 30,
    timePercent: 20,
    spent: 100_000,
    plannedOut: 200_000,
    spentPercent: 50,
  },
  upcoming: [
    {
      id: 'e1',
      cycleMonth: '2026-09',
      description: 'Electricity',
      dueDate: '2026-09-15',
      amount: -28_000,
      isEstimate: false,
      isOverdue: false,
      daysLate: 0,
    },
    {
      id: 'e2',
      cycleMonth: '2026-09',
      description: 'Contractor Costs',
      dueDate: '2026-09-25',
      amount: -150_000,
      isEstimate: true,
      isOverdue: false,
      daysLate: 0,
    },
  ],
});
