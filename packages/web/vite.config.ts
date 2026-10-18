import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Same-origin path to the API (DIS-58 design D8): the page calls relative URLs and both local servers
 * forward them, because the API has no CORS. `127.0.0.1`, not `localhost`, so Node does not resolve `::1`
 * while the API listens on IPv4. Changing the API's `PORT` means changing this table.
 */
const apiProxy = {
  '/api': 'http://127.0.0.1:3000',
  '/health': 'http://127.0.0.1:3000',
};

export default defineConfig({
  // Tailwind 4 reads its configuration from `src/index.css` (DIS-58 design D3).
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
