import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/app.js';
import '@/app/styles/index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root container');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
