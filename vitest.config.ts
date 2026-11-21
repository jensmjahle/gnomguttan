import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Client unit tests (pure logic and stores). Server tests run on node:test: `npm run test:feed`.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
