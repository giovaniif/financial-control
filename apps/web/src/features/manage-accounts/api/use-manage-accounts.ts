import type { AccountResponse, OpenAccountRequest } from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

function useAccountMutation<TInput>(send: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: async () => {
      // The accounts total seeds the first cycle's opening balance, so the
      // whole chain moves with it.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.accounts() }),
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
        client.invalidateQueries({ queryKey: queryKeys.setup() }),
      ]);
    },
  });
}

/** UC-1.2 — the app's starting cash, and the sidebar total. */
export function useOpenAccount() {
  return useAccountMutation((account: OpenAccountRequest) =>
    api<AccountResponse>('/accounts', {
      method: 'POST',
      body: JSON.stringify(account),
    }),
  );
}

export function useUpdateAccount(id: string) {
  const rename = useAccountMutation((name: string) =>
    api<AccountResponse>(`/accounts/${id}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  );

  const correct = useAccountMutation((balance: number) =>
    api<AccountResponse>(`/accounts/${id}/balance`, {
      method: 'PATCH',
      body: JSON.stringify({ balance }),
    }),
  );

  const remove = useAccountMutation(() =>
    api<null>(`/accounts/${id}`, { method: 'DELETE' }),
  );

  return { rename, correct, remove };
}
