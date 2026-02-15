import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  plugins: [
    react({
      babel: {
        plugins: [
          [
            'babel-plugin-react-compiler',
            {
              compilationMode: 'all',
              panicThreshold: 'NONE',
              environment: {
                enableTreatRefLikeIdentifiersAsRefs: true,
                enableTreatFunctionDepsAsConst: false,
              },
            },
          ],
        ],
      },
    }),
  ],
})
