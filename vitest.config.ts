import { defineConfig } from 'vite';

export default defineConfig({
  // @ts-expect-error Vitest configuration field
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
