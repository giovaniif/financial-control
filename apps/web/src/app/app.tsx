import { createBrowserRouter, RouterProvider } from 'react-router';

import { QueryProvider } from './providers/query-provider.js';
import { routes } from './routes.js';

const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryProvider>
      <RouterProvider router={router} />
    </QueryProvider>
  );
}
