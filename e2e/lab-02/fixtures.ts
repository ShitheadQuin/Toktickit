// PR #30 review, item 3: every Ticket this suite creates carries this prefix, so
// global-teardown.ts can find and delete exactly its own fixtures afterward, whatever else is
// in the database - the same convention the Vitest API suites use with their own MARK constants.
export const E2E_MARK = 'PW-LAB02';
