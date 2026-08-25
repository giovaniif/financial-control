import type {
  SetupAppliedResponse,
  SetupRecordCorrectionRequest,
  SetupTurnRequest,
  SetupTurnResponse,
} from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/**
 * One turn of the setup conversation. The transcript itself never travels:
 * the server holds it, and the client carries only the id it was handed back.
 */
export function useSetupTurn() {
  return useMutation({
    mutationFn: (request: SetupTurnRequest) =>
      api<SetupTurnResponse>('/setup/conversation', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
  });
}

/** Which record of which conversation an inline edit is about. */
interface RecordRef {
  conversationId: string;
  recordId: string;
}

const pathOf = ({ conversationId, recordId }: RecordRef): string =>
  `/setup/conversation/${conversationId}/records/${recordId}`;

/**
 * An inline edit — UC-1.5. It goes straight to the draft with no model in the
 * path: the fields are already named, so there is nothing to interpret, and
 * routing a form the user filled in through the assistant would buy a call and
 * a chance of misreading on the very flow that exists to fix misreadings.
 *
 * Nothing is invalidated here because nothing is written yet. The draft lives
 * in the conversation until it is applied, and applying is what refreshes the
 * screens it lands on.
 */
export function useCorrectSetupRecord() {
  return useMutation({
    mutationFn: ({
      correction,
      ...ref
    }: RecordRef & { correction: SetupRecordCorrectionRequest }) =>
      api<SetupTurnResponse>(pathOf(ref), {
        method: 'PATCH',
        body: JSON.stringify(correction),
      }),
  });
}

/** Dropping a record the conversation should never have understood. */
export function useDropSetupRecord() {
  return useMutation({
    mutationFn: (ref: RecordRef) =>
      api<SetupTurnResponse>(pathOf(ref), { method: 'DELETE' }),
  });
}

/**
 * The first and only moment the conversation writes anything — UC-1.5. Until
 * this runs there is no half-finished setup to clean up, which is why every
 * screen the new data lands on is invalidated here and nowhere earlier.
 */
export function useApplySetup() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      api<SetupAppliedResponse>(`/setup/conversation/${conversationId}/apply`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          queryKeys.setup(),
          queryKeys.accounts(),
          queryKeys.templates(),
          queryKeys.buckets(),
          queryKeys.cycles(),
          queryKeys.dashboard(),
          queryKeys.anchor(),
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
  });
}
