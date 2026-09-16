import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma';
import { comparePassword, hashPassword } from '../../src/auth/password-hash';
import { createSession } from '../../src/auth/session';
import { validatePassword } from '../../src/auth/password-rules';

// Administrator User Management - api-spec.md 6, BR-19 to BR-23, AC-18 to AC-22, AC-28.
// The fixture Administrator is made the only active Administrator for this file: any other active
// Administrator (the seeded one included) is set inactive in beforeAll and restored in afterAll,
// because the last-active-Administrator rule depends on that count. server/vitest.config.ts runs
// test files one at a time, so no other file's fixture Administrators change it mid-test.
const EMAIL_PREFIX = 'lab3-users-admin-test-';
const PASSWORD = 'FixturePass1';
const email = (key: string) => `${EMAIL_PREFIX}${key}@toktickit.dev`;

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

describe('Administrator User Management API', () => {
  const ids = { admin: 0, requester: 0, staff: 0 };
  const cookies = { admin: '', requester: '', staff: '' };
  let otherActiveAdminIds: number[] = [];

  const as = (cookie: string) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => request(app).post(url).set('Cookie', cookie).send(body ?? {}),
    patch: (url: string, body: object) => request(app).patch(url).set('Cookie', cookie).send(body),
  });
  const login = (address: string, password: string) => request(app).post('/api/auth/login').send({ email: address, password });

  async function makeUser(key: string, name: string, role: Role) {
    return prisma.user.create({
      data: { name, email: email(key), role, passwordHash: await hashPassword(PASSWORD), mustChangePassword: false },
    });
  }

  beforeAll(async () => {
    const others = await prisma.user.findMany({ where: { role: 'ADMINISTRATOR', isActive: true }, select: { id: true } });
    otherActiveAdminIds = others.map((user) => user.id);
    await prisma.user.updateMany({ where: { id: { in: otherActiveAdminIds } }, data: { isActive: false } });

    const admin = await makeUser('admin', 'Users Admin Fixture', 'ADMINISTRATOR');
    const requester = await makeUser('requester', 'Users Requester Fixture', 'REQUESTER');
    const staff = await makeUser('staff', 'Users Staff Fixture', 'IT_STAFF');
    Object.assign(ids, { admin: admin.id, requester: requester.id, staff: staff.id });
    cookies.admin = `sid=${(await createSession(admin.id)).token}`;
    cookies.requester = `sid=${(await createSession(requester.id)).token}`;
    cookies.staff = `sid=${(await createSession(staff.id)).token}`;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
    await prisma.user.updateMany({ where: { id: { in: otherActiveAdminIds } }, data: { isActive: true } });
  });

  describe('GET /api/users (API-45)', () => {
    it('lists users as id, name, email, role and isActive, searchable by name or email, filterable by role', async () => {
      const byEmail = await as(cookies.admin).get(`/api/users?search=${EMAIL_PREFIX}`);
      expect(byEmail.status).toBe(200);
      expect(byEmail.body.map((user: { email: string }) => user.email)).toEqual(
        expect.arrayContaining([email('admin'), email('requester'), email('staff')]),
      );
      for (const user of byEmail.body) {
        expect(Object.keys(user).sort()).toEqual(['email', 'id', 'isActive', 'name', 'role']);
      }

      const byName = await as(cookies.admin).get('/api/users?search=users%20staff%20fixture');
      expect(byName.body.map((user: { id: number }) => user.id)).toEqual([ids.staff]);

      const byRole = await as(cookies.admin).get(`/api/users?search=${EMAIL_PREFIX}&role=IT_STAFF`);
      expect(byRole.body.map((user: { id: number }) => user.id)).toEqual([ids.staff]);
    });
  });

  describe('POST /api/users (API-32, API-33, API-34)', () => {
    it('API-33: creates a user with one role and returns a one-time initial password that meets BR-10', async () => {
      const response = await as(cookies.admin).post('/api/users', {
        name: 'New Staff Member',
        email: `  ${email('created').toUpperCase()} `,
        role: 'IT_STAFF',
        isActive: true,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ name: 'New Staff Member', email: email('created'), role: 'IT_STAFF', isActive: true, mustChangePassword: true });
      const { initialPassword } = response.body;
      expect(validatePassword(initialPassword).valid).toBe(true);
      expect(initialPassword).toHaveLength(12);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: email('created') } });
      expect(stored.passwordHash).not.toBe(initialPassword);
      expect(await comparePassword(initialPassword, stored.passwordHash)).toBe(true);

      // Only in the create response - never in the list.
      const list = await as(cookies.admin).get(`/api/users?search=${email('created')}`);
      expect(JSON.stringify(list.body)).not.toContain(initialPassword);

      // API-34: the new user can log in with it, and must change it first (AC-19).
      const loggedIn = await login(email('created'), initialPassword);
      expect(loggedIn.status).toBe(200);
      expect(loggedIn.body.mustChangePassword).toBe(true);
    });

    it('API-32: rejects an email already in use, in any letter case, with 409 EMAIL_ALREADY_EXISTS', async () => {
      const response = await as(cookies.admin).post('/api/users', { name: 'Duplicate', email: email('requester').toUpperCase(), role: 'REQUESTER' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects a missing name, an invalid email, or a role that is not one of the three with 400 (BR-21)', async () => {
      for (const body of [
        { email: email('no-name'), role: 'REQUESTER' },
        { name: 'Bad Email', email: 'not-an-email', role: 'REQUESTER' },
        { name: 'Bad Role', email: email('bad-role'), role: 'SUPERUSER' },
      ]) {
        const response = await as(cookies.admin).post('/api/users', body);
        expect(response.status, JSON.stringify(body)).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('PATCH /api/users/:id (API-46, API-35, API-36, API-37)', () => {
    it('API-46: edits name, email, role and activation; a deactivated user cannot log in until reactivated', async () => {
      const target = await makeUser('edit-target', 'Edit Target', 'REQUESTER');

      const edited = await as(cookies.admin).patch(`/api/users/${target.id}`, { name: 'Edited Target', email: email('edited'), role: 'IT_STAFF' });
      expect(edited.status).toBe(200);
      expect(edited.body).toEqual({ id: target.id, name: 'Edited Target', email: email('edited'), role: 'IT_STAFF', isActive: true });

      const deactivated = await as(cookies.admin).patch(`/api/users/${target.id}`, { isActive: false });
      expect(deactivated.body.isActive).toBe(false);
      expect((await login(email('edited'), PASSWORD)).status).toBe(401);

      await as(cookies.admin).patch(`/api/users/${target.id}`, { isActive: true });
      expect((await login(email('edited'), PASSWORD)).status).toBe(200);
    });

    it('rejects changing an email to one another user already has with 409 EMAIL_ALREADY_EXISTS', async () => {
      const response = await as(cookies.admin).patch(`/api/users/${ids.staff}`, { email: email('requester') });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('API-35: an Administrator cannot deactivate their own account', async () => {
      const response = await as(cookies.admin).patch(`/api/users/${ids.admin}`, { isActive: false });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SELF_DEACTIVATION_BLOCKED');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } })).isActive).toBe(true);
    });

    it('API-36: the last active Administrator cannot change their role away from Administrator', async () => {
      const response = await as(cookies.admin).patch(`/api/users/${ids.admin}`, { role: 'IT_STAFF' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('LAST_ACTIVE_ADMIN_BLOCKED');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } })).role).toBe('ADMINISTRATOR');
    });

    it('API-37: applies only name, email, role and isActive, ignoring any other field sent', async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: ids.requester } });

      const response = await as(cookies.admin).patch(`/api/users/${ids.requester}`, {
        name: 'Renamed Requester',
        passwordHash: 'not-a-real-hash',
        mustChangePassword: true,
        id: 999999,
      });

      expect(response.status).toBe(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: ids.requester } });
      expect(after).toMatchObject({ name: 'Renamed Requester', passwordHash: before.passwordHash, mustChangePassword: false });
    });

    it('returns 404 for a user that does not exist', async () => {
      expect((await as(cookies.admin).patch('/api/users/99999999', { name: 'Nobody' })).status).toBe(404);
    });
  });

  describe('POST /api/users/:id/reset-password (API-47)', () => {
    it('API-47: sets a new one-time password, forces a change, ends the old session, and the new password logs in', async () => {
      const target = await makeUser('reset-target', 'Reset Target', 'REQUESTER');
      const oldCookie = `sid=${(await createSession(target.id)).token}`;

      const response = await as(cookies.admin).post(`/api/users/${target.id}/reset-password`);

      expect(response.status).toBe(200);
      expect(Object.keys(response.body)).toEqual(['initialPassword']);
      expect(validatePassword(response.body.initialPassword).valid).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).mustChangePassword).toBe(true);

      expect((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
      expect((await login(email('reset-target'), PASSWORD)).status).toBe(401);
      const loggedIn = await login(email('reset-target'), response.body.initialPassword);
      expect(loggedIn.status).toBe(200);
      expect(loggedIn.body.mustChangePassword).toBe(true);
    });

    it('returns 404 for a user that does not exist', async () => {
      expect((await as(cookies.admin).post('/api/users/99999999/reset-password')).status).toBe(404);
    });
  });

  describe('non-Administrators (API-38)', () => {
    it('API-38: a Requester and IT Staff get 403 FORBIDDEN from every /api/users endpoint, with no user data', async () => {
      for (const cookie of [cookies.requester, cookies.staff]) {
        const responses = [
          await as(cookie).get('/api/users'),
          await as(cookie).post('/api/users', { name: 'Sneaky', email: email('sneaky'), role: 'ADMINISTRATOR' }),
          await as(cookie).patch(`/api/users/${ids.admin}`, { isActive: false }),
          await as(cookie).post(`/api/users/${ids.admin}/reset-password`),
        ];
        for (const response of responses) {
          expect(response.status).toBe(403);
          expect(response.body.error.code).toBe('FORBIDDEN');
          expect(response.body.initialPassword).toBeUndefined();
          expect(Array.isArray(response.body)).toBe(false);
        }
      }
      expect(await prisma.user.findUnique({ where: { email: email('sneaky') } })).toBeNull();
    });
  });
});
