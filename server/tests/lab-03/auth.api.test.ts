import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { hashPassword } from '../../src/auth/password-hash';
import { resetAttempts } from '../../src/auth/login-throttle';

function sidCookie(response: request.Response): string {
  const cookie = response.headers['set-cookie']?.[0];
  if (!cookie) throw new Error('Expected a set-cookie header on the login response');
  return cookie;
}

// Self-contained fixtures, not the shared seeded accounts: an auth test that changes a password
// or burns through login attempts must not consume the real seed data the plan's screenshot
// evidence depends on (see LAB3_PLAN.md's "First-login change-password screen" note).
const EMAIL_PREFIX = 'lab3-auth-test-';
const PASSWORD = 'CorrectHorse1';

async function makeUser(overrides: { email: string; isActive?: boolean; mustChangePassword?: boolean }) {
  return prisma.user.create({
    data: {
      name: 'Auth Test User',
      email: overrides.email,
      role: 'IT_STAFF',
      isActive: overrides.isActive ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
}

describe('auth API (API-01 to API-08)', () => {
  const activeEmail = `${EMAIL_PREFIX}active@toktickit.dev`;
  const inactiveEmail = `${EMAIL_PREFIX}inactive@toktickit.dev`;
  const mustChangeEmail = `${EMAIL_PREFIX}mustchange@toktickit.dev`;
  const throttleEmail = `${EMAIL_PREFIX}throttle@toktickit.dev`;

  beforeAll(async () => {
    await makeUser({ email: activeEmail });
    await makeUser({ email: inactiveEmail, isActive: false });
    await makeUser({ email: mustChangeEmail, mustChangePassword: true });
    await makeUser({ email: throttleEmail });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });

  // API-01
  it('logs in with valid credentials, returns identity and role, sets the sid cookie', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: activeEmail, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email: activeEmail, role: 'IT_STAFF', mustChangePassword: false });
    expect(response.headers['set-cookie']?.[0]).toMatch(/^sid=/);
  });

  // PR #43 review, BR-19: email is unique case-insensitively; login must match regardless of case.
  it('logs in successfully when the submitted email differs only in case', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: activeEmail.toUpperCase(), password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(activeEmail);
  });

  // API-02, BR-06
  it('returns the identical generic message for an unknown email and a wrong password', async () => {
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@toktickit.dev', password: PASSWORD });
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: activeEmail, password: 'WrongPassword1' });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  // API-03, BR-07
  it('returns the same generic message for an inactive account with correct credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: inactiveEmail, password: PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe('Invalid email or password.');
  });

  // API-04, BR-08, AC-25
  it('rejects the 6th failed login attempt for one email with 429', async () => {
    resetAttempts(throttleEmail);
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post('/api/auth/login').send({ email: throttleEmail, password: 'WrongPassword1' });
      expect(response.status).toBe(401);
    }
    const sixth = await request(app).post('/api/auth/login').send({ email: throttleEmail, password: 'WrongPassword1' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  // API-05, AC-07, BR-11
  it('logout invalidates the session; the old cookie is rejected afterward', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: activeEmail, password: PASSWORD });
    const cookie = sidCookie(login);

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(200);

    const reuse = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('UNAUTHENTICATED');
  });

  // API-06, AC-08
  it('GET /api/auth/me returns the authenticated identity', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: activeEmail, password: PASSWORD });
    const cookie = sidCookie(login);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: activeEmail, role: 'IT_STAFF' });
  });

  it('GET /api/auth/me without a session returns 401', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  // API-07, AC-02, BR-02
  it('change-password succeeds while mustChangePassword is true, and clears the flag', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: mustChangeEmail, password: PASSWORD });
    expect(login.body.mustChangePassword).toBe(true);
    const cookie = sidCookie(login);

    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' });

    expect(change.status).toBe(200);
    expect(change.body.mustChangePassword).toBe(false);

    const reLogin = await request(app).post('/api/auth/login').send({ email: mustChangeEmail, password: 'NewPassw0rd' });
    expect(reLogin.status).toBe(200);
  });

  it('change-password rejects an incorrect current password', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: activeEmail, password: PASSWORD });
    const cookie = sidCookie(login);

    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'WrongPassword1', newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' });

    expect(change.status).toBe(400);
    expect(change.body.error.code).toBe('INCORRECT_CURRENT_PASSWORD');
  });

  it('change-password rejects a newPassword that fails BR-10, and a mismatched confirmPassword', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: activeEmail, password: PASSWORD });
    const cookie = sidCookie(login);

    const tooShort = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'short1', confirmPassword: 'short1' });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error.code).toBe('VALIDATION_ERROR');

    const mismatch = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassw0rd', confirmPassword: 'Different1' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('VALIDATION_ERROR');
  });
});
