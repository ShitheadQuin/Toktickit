import { defineConfig } from 'vitest/config';

// Issue #39: test files run one at a time. They all share one real database, and
// users-admin.api.test.ts has to be the only active Administrator while it checks the
// last-active-Administrator rule - other files create fixture Administrators, which would otherwise
// change that count mid-test and make the result depend on timing.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
