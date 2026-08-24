import { createBrowserRouter, RouterProvider } from 'react-router';

import { AssistantRailProvider } from '@/shared/model';

import { QueryProvider } from './providers/query-provider.js';
import { routes } from './routes.js';

const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryProvider>
      <AssistantRailProvider>
        <RouterProvider router={router} />
      </AssistantRailProvider>
    </QueryProvider>
  );
}
