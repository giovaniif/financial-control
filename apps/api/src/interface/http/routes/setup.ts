import type { SetupStateResponse } from '@fin/contracts';
import type { FastifyInstance } from 'fastify';

import type { ReadSetupState } from '../../../application/projection/uc-1-5-read-setup-state.js';

interface Dependencies {
  readSetupState: ReadSetupState;
}

/** UC-1.5 — whether the app has been set up, and what is still missing. */
export function registerSetupRoutes(
  app: FastifyInstance,
  { readSetupState }: Dependencies,
): void {
  app.get('/setup', async (): Promise<SetupStateResponse> =>
    readSetupState.execute(),
  );
}
