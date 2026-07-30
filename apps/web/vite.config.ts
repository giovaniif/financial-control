import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Both are required and fix different layers: `host` binds every interface
    // so the app is reachable from another machine, and `allowedHosts` stops
    // Vite rejecting the Tailscale MagicDNS Host header.
    host: true,
    allowedHosts: ['.ts.net'],
  },
});
