import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The production build is served by Express at /dashboard, not at the
  // root — this base path makes the built asset URLs resolve correctly.
  base: '/dashboard/',
  server: {
    // During `npm run dev` (port 5173), proxy API calls to the termmind
    // Express server (port 4756) so the dashboard can just call `/api/...`
    // with no CORS config needed, in dev AND in the production build.
    proxy: {
      '/api': 'http://localhost:4756',
    },
  },
})