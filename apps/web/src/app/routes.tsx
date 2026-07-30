import type { RouteObject } from 'react-router';

import { BucketsPage } from '@/pages/buckets';
import { CardsPage } from '@/pages/cards';
import { DashboardPage } from '@/pages/dashboard';
import { LedgerPage } from '@/pages/ledger';
import { NotFoundPage } from '@/pages/not-found';
import { SettingsPage } from '@/pages/settings';
import { TemplatesPage } from '@/pages/templates';
import { WealthPage } from '@/pages/wealth';

/**
 * Route objects rather than `<Routes>` elements: this is React Router's data
 * mode, which is what gives the app `errorElement` boundaries, `useNavigation`
 * pending state and route-level actions.
 *
 * Loaders stay empty on purpose. Server state is TanStack Query's job — see
 * `.claude/architecture.md` — so routes describe structure, not data.
 */
export const routes: RouteObject[] = [
  { path: '/', element: <DashboardPage /> },
  { path: '/ledger', element: <LedgerPage /> },
  { path: '/cards', element: <CardsPage /> },
  { path: '/buckets', element: <BucketsPage /> },
  { path: '/wealth', element: <WealthPage /> },
  { path: '/templates', element: <TemplatesPage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '*', element: <NotFoundPage /> },
];
