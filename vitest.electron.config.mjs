import { defineConfig } from 'vitest/config';

// Main-process tests run under Electron's Node (see scripts/test-electron.js) so that
// better-sqlite3 loads the same native binary the app ships with.
export default defineConfig({
  test: {
    include: ['tests/electron/**/*.test.js'],
    environment: 'node',
  },
});
