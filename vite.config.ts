import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Порт 5173 разрешён в CORS шлюза и сервисов.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
