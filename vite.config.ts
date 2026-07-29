import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@mock': path.resolve(__dirname, 'src/mock'),
      '@config': path.resolve(__dirname, 'src/config'),
    },
  },
  build: {
    // Vendor code changes far less often than app code. Splitting it means a
    // redeploy invalidates only the small app chunk and leaves the large
    // vendor chunks cached in every viewer's browser and on Vercel's CDN.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          query: ['@tanstack/react-query'],
        },
      },
    },
    // The vendor chunks are legitimately large; the warning is noise once they
    // are deliberately split and long-cached.
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173 },
});
