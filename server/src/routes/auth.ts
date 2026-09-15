import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware';
import { comparePassword, hashPassword, DUMMY_PASSWORD_HASH } from '../auth/password-hash';
import { createSession, deleteSession } from '../auth/session';
import { isThrottled, recordFailedAttempt, resetAttempts } from '../auth/login-throttle';
import { validatePassword } from '../auth/password-rules';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

function userShape(user: { id: number; name: string; email: string; role: string; mustChangePassword: boolean }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'email and password are required' },
    });
  }

  if (isThrottled(email)) {
    return res.status(429).json({
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed attempts. Try again later.' },
    });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // BR-06: the comparison always runs, against the real hash when found and a fixed dummy hash
  // when not, so an unknown email takes the same time as a wrong password.
  const matches = await comparePassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  // BR-06/BR-07: unknown email, wrong password, and a correct but inactive account all return the
  // identical generic message - inactivity and account existence are never revealed.
  if (!user || !matches || !user.isActive) {
    recordFailedAttempt(email);
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    });
  }

  resetAttempts(email);
  const { token, expiresAt } = await createSession(user.id);
  res.cookie('sid', token, { ...COOKIE_OPTIONS, expires: expiresAt });
  res.status(200).json(userShape(user));
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.sid;
  if (typeof token === 'string') {
    await deleteSession(token);
  }
  res.clearCookie('sid', COOKIE_OPTIONS);
  res.status(200).json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.status(200).json(userShape(req.user!));
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
  const user = req.user!;

  if (typeof currentPassword !== 'string' || !(await comparePassword(currentPassword, user.passwordHash))) {
    return res.status(400).json({
      error: { code: 'INCORRECT_CURRENT_PASSWORD', message: 'Current password is incorrect.' },
    });
  }

  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'newPassword is invalid', fields: validation.errors.map((message) => ({ field: 'newPassword', message })) },
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'confirmPassword must match newPassword', fields: [{ field: 'confirmPassword', message: 'confirmPassword must match newPassword' }] },
    });
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  res.status(200).json(userShape(updated));
});

export default router;
