import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Tailwind 4 reads its configuration from `src/index.css` (DIS-58 design D3).
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
  },
});
