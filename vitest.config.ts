import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  // `tsconfig.json` má `jsx: 'preserve'` (Next.js compiler si JSX přeloží sám).
  // Pod Vitest ale JSX/TSX (komponenty i jejich testy) transpiluje oxc — proto
  // mu zde explicitně zapneme automatický JSX runtime (react/jsx-runtime), jinak
  // by import komponent bez `import React` selhal.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'src/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
      'tests/**/*.spec.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
