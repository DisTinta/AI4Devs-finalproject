import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createAppRouter } from './router';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('index.html has no #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
  </StrictMode>,
);
