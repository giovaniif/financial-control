import { createBrowserRouter, RouterProvider } from 'react-router';

import { EstimatesProvider } from '@/shared/model';

import { QueryProvider } from './providers/query-provider.js';
import { routes } from './routes.js';

const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryProvider>
      <EstimatesProvider>
        <RouterProvider router={router} />
      </EstimatesProvider>
    </QueryProvider>
  );
}
