import { describe, it } from 'vitest';

// Implemented in Issue 2 (feature/2-health-check).
// GET /api/health should return 200 with { status: "ok", service: "TokTickIT API" }
describe('GET /api/health', () => {
  it.todo('returns 200 and { status: "ok", service: "TokTickIT API" }');
});
