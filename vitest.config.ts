import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'server/**/__tests__/**/*.test.ts',
    ],
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
