import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';

// PERF-01 - AC-32: a smoke check, not a load test. Each dashboard answers within 1 second on the
// local development database with its seeded data.
const EMAIL_PREFIX = 'lab4-dash-perf-test-';

describe('Dashboard performance smoke (PERF-01, AC-32)', () => {
  const cookies = { requester: '', staff: '' };

  beforeAll(async () => {
    const passwordHash = await hashPassword('FixturePass1');
    for (const [key, role] of [['requester', 'REQUESTER'], ['staff', 'IT_STAFF']] as const) {
      const user = await prisma.user.create({ data: { name: `Perf ${key}`, email: `${EMAIL_PREFIX}${key}@toktickit.dev`, role, passwordHash, mustChangePassword: false } });
      cookies[key] = `sid=${(await createSession(user.id)).token}`;
    }
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  for (const [name, url, key] of [['Requester', '/api/dashboard/requester', 'requester'], ['Staff', '/api/dashboard/staff', 'staff']] as const) {
    it(`answers the ${name} dashboard within 1 second`, async () => {
      await request(app).get(url).set('Cookie', cookies[key]); // warm-up, so connection setup is not timed
      const started = performance.now();
      const response = await request(app).get(url).set('Cookie', cookies[key]);
      const elapsed = performance.now() - started;
      expect(response.status).toBe(200);
      expect(elapsed).toBeLessThan(1000);
    });
  }
});
