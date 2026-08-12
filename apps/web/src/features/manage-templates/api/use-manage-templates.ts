import type {
  ChangeTemplateAmountRequest,
  CreateTemplateRequest,
  TemplateResponse,
  TemplateStatus,
} from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, queryKeys } from '@/shared/api';

/**
 * A template change moves the templates list, every cycle it generates into,
 * and the dashboard built on top of those.
 */
function useTemplateMutation<TInput>(
  send: (input: TInput) => Promise<unknown>,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.templates() }),
        client.invalidateQueries({ queryKey: queryKeys.cycles() }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard() }),
        client.invalidateQueries({ queryKey: queryKeys.setup() }),
      ]);
    },
  });
}

/** UC-2.1, UC-2.2 — one template per recurring item, in or out. */
export function useCreateTemplate() {
  return useTemplateMutation((template: CreateTemplateRequest) =>
    api<TemplateResponse>('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    }),
  );
}

/** UC-2.3, UC-2.4 — the scope choice, and the value schedule behind it. */
export function useChangeTemplateAmount(id: string) {
  return useTemplateMutation((change: ChangeTemplateAmountRequest) =>
    api<TemplateResponse>(`/templates/${id}/amount`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    }),
  );
}

/** UC-2.5, UC-2.6 — pause, resume, end, and the estimate flag. */
export function useUpdateTemplate(id: string) {
  return useTemplateMutation(
    (change: {
      name?: string;
      status?: TemplateStatus;
      endMonth?: string;
      isEstimate?: boolean;
    }) =>
      api<TemplateResponse>(`/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(change),
      }),
  );
}
