import type { RouteObject } from 'react-router';

import { MainPage } from '@/pages/main';
import { NotFoundPage } from '@/pages/not-found';
import { OnboardingPage } from '@/pages/onboarding';
import { ProfilePage } from '@/pages/profile';
import { SavingsPage } from '@/pages/savings';

import { SetupGate } from './setup-gate.js';

/**
 * Route objects rather than `<Routes>` elements: this is React Router's data
 * mode, which is what gives the app `errorElement` boundaries, `useNavigation`
 * pending state and route-level actions.
 *
 * Loaders stay empty on purpose. Server state is TanStack Query's job — see
 * `.claude/architecture.md` — so routes describe structure, not data.
 *
 * Three screens, per `docs/USE_CASES.md` §5. The detail the removed four used
 * to show is asked for instead, so nothing here redirects: an old path is an
 * unknown path.
 *
 * Every screen sits behind the first-run gate. The wizard itself does not, or
 * the redirect would have nowhere to land.
 */
export const routes: RouteObject[] = [
  { path: '/onboarding', element: <OnboardingPage /> },
  {
    element: <SetupGate />,
    children: [
      { path: '/', element: <MainPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/savings', element: <SavingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
