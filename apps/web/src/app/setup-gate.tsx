import { Navigate, Outlet, useLocation } from 'react-router';

import { useSetupState } from '@/shared/api';
import { hasSkippedSetup } from '@/shared/model';

/**
 * UC-1.5 — an app that has never been configured opens on the wizard rather
 * than on a dashboard of zeros.
 *
 * It renders nothing until the setup state arrives: redirecting early shows
 * the wizard to a configured app, and rendering early shows the empty app to
 * someone who is about to be sent away from it.
 */
export function SetupGate() {
  const { data, isPending, isError } = useSetupState();
  const location = useLocation();

  if (isPending) {
    return null;
  }

  // A setup state nobody could read is no reason to withhold the app.
  if (isError) {
    return <Outlet />;
  }

  if (data.isPristine && !hasSkippedSetup()) {
    return (
      <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
    );
  }

  return <Outlet />;
}
