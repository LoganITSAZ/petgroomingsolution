import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" for Next's own compiler, and this
  // Vite version's default (oxc) transform ignores the `esbuild.jsx` escape
  // hatch, so a dedicated plugin handles JSX in .tsx test files instead.
  plugins: [react()],
  test: {
    // Fast default for the existing pure-logic lib/*.test.ts suite. Component
    // tests opt into the DOM with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});

