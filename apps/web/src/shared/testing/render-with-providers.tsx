import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { AssistantRailProvider } from '../model/index.js';

/**
 * Every screen reads server state, the estimates toggle and the assistant
 * rail, so a test that renders one needs all three providers. Retries are
 * off: a test asserting an error state should not wait for three attempts
 * first.
 */
export function renderWithProviders(ui: ReactElement): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AssistantRailProvider>{children}</AssistantRailProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
