import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'build',
          environment: 'node',
          // These assert facts about dist/ and therefore require `npm run build`
          // to have completed first. `npm run verify` sequences that correctly.
          include: ['tests/build/**/*.test.ts'],
        },
      },
    ],
  },
});
