import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Inside compose the backend/engine resolve as `backend`/`ludo-engine`; running
// `npm run dev` on the host they're on their published ports instead. Both
// proxies mirror the location blocks in nginx/conf/app.inc so all three paths
// (nginx, this dev server, and — for the engine — direct docker DNS) behave
// the same and the browser never needs to know the engine's real address.
const inContainer = process.env.VITE_IN_CONTAINER === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // publish.sh points these outside the bind-mounted /app (see its comments)
  // to dodge a Docker Desktop for Mac VirtioFS bug: reading a bind-mounted
  // file via a zero-copy syscall (used by both Node's fs.copyFileSync and
  // plain `cp`/`tar` — confirmed by testing directly, plain read()/write()
  // via `cat`/`dd` is unaffected) intermittently fails with "Unknown system
  // error -35". Both default to the normal in-project paths for local/host
  // builds, which aren't affected.
  publicDir: process.env.BUILD_PUBLIC_DIR || 'public',
  build: {
    outDir: process.env.BUILD_OUT_DIR || 'dist',
    emptyOutDir: true,
    cssMinify: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@dicebear')) {
              return 'vendor-dicebear'
            }
            if (id.includes('socket.io-client')) {
              return 'vendor-socket'
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react'
            }
            if (id.includes('i18next')) {
              return 'vendor-i18n'
            }
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 8080,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_ENGINE_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
    // Bind mounts on macOS don't deliver inotify events reliably, so file
    // changes only reach HMR via polling when containerised.
    watch: inContainer ? { usePolling: true, interval: 300 } : undefined,
  },
})
