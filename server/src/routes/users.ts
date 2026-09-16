import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware';
import { hashPassword } from '../auth/password-hash';
import { generateInitialPassword } from '../auth/initial-password';

// api-spec.md 6: Administrator User Management, mounted at /api/users. Every route is
// Administrator-only - anyone else gets 403 before any user is looked up (BR-20).
const router = Router();
const adminOnly = [requireAuth, requirePasswordChanged, requireRole('ADMINISTRATOR')];

const ROLES = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const;
type RoleValue = (typeof ROLES)[number];

const USER_SELECT = { id: true, name: true, email: true, role: true, isActive: true } as const;
const USER_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'User not found' } };
const EMAIL_TAKEN = { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email already in use' } };

type FieldError = { field: string; message: string };
type UserFields = { name?: string; email?: string; role?: RoleValue; isActive?: boolean };

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

const errorCode = (error: unknown) => (error as { code?: string } | null)?.code;

// BR-22: only name, email, role and isActive are ever read from the body - any other field sent
// (passwordHash, mustChangePassword, id, ...) is never looked at, so it can't be applied.
function readUserFields(body: unknown, requireAll: boolean): { fields: UserFields; errors: FieldError[] } {
  const input = (body ?? {}) as Record<string, unknown>;
  const fields: UserFields = {};
  const errors: FieldError[] = [];

  if (requireAll || input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 100) errors.push({ field: 'name', message: 'name is required, up to 100 characters' });
    else fields.name = name;
  }
  // BR-19: stored trimmed and lowercased, matching how login compares emails.
  if (requireAll || input.email !== undefined) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: 'email', message: 'email must be a valid email address' });
    else fields.email = email;
  }
  // BR-21: exactly one of the three roles.
  if (requireAll || input.role !== undefined) {
    if (!ROLES.includes(input.role as RoleValue)) errors.push({ field: 'role', message: 'role must be REQUESTER, IT_STAFF, or ADMINISTRATOR' });
    else fields.role = input.role as RoleValue;
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') errors.push({ field: 'isActive', message: 'isActive must be true or false' });
    else fields.isActive = input.isActive;
  }

  return { fields, errors };
}

const validationError = (errors: FieldError[]) => ({
  error: { code: 'VALIDATION_ERROR', message: errors[0]?.message ?? 'One or more fields are invalid', fields: errors },
});

router.get('/', ...adminOnly, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role : '';
    // An unknown role matches nobody rather than being ignored, same as the Queue's filters.
    if (role && !ROLES.includes(role as RoleValue)) return res.status(200).json([]);

    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as RoleValue } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: USER_SELECT,
    });
    res.status(200).json(users);
  } catch (error) {
    console.error('GET /api/users failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to retrieve users' } });
  }
});

router.post('/', ...adminOnly, async (req, res) => {
  try {
    const { fields, errors } = readUserFields(req.body, true);
    if (errors.length > 0) return res.status(400).json(validationError(errors));
    if (await prisma.user.findUnique({ where: { email: fields.email! }, select: { id: true } })) {
      return res.status(409).json(EMAIL_TAKEN);
    }

    // specification.md 11: generated server-side and returned once, in this response only; only
    // its hash is stored.
    const initialPassword = generateInitialPassword();
    const user = await prisma.user.create({
      data: {
        name: fields.name!,
        email: fields.email!,
        role: fields.role!,
        isActive: fields.isActive ?? true,
        mustChangePassword: true,
        passwordHash: await hashPassword(initialPassword),
      },
      select: { ...USER_SELECT, mustChangePassword: true },
    });
    res.status(201).json({ ...user, initialPassword });
  } catch (error) {
    if (errorCode(error) === 'P2002') return res.status(409).json(EMAIL_TAKEN);
    console.error('POST /api/users failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to create user' } });
  }
});

router.patch('/:id', ...adminOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const target = id === null ? null : await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true } });
    if (!target) return res.status(404).json(USER_NOT_FOUND);

    const { fields, errors } = readUserFields(req.body, false);
    if (errors.length > 0) return res.status(400).json(validationError(errors));
    if (fields.email && (await prisma.user.findFirst({ where: { email: fields.email, NOT: { id: target.id } }, select: { id: true } }))) {
      return res.status(409).json(EMAIL_TAKEN);
    }

    // FR-21: never your own account.
    if (fields.isActive === false && target.id === req.user!.id) {
      return res.status(409).json({ error: { code: 'SELF_DEACTIVATION_BLOCKED', message: "You can't deactivate your own account" } });
    }

    // FR-22: a change that would take away an active Administrator is checked against how many
    // others are left, in one serializable transaction so two such changes at once can't both pass.
    const removesAnAdmin =
      target.role === 'ADMINISTRATOR' && target.isActive && (fields.isActive === false || (fields.role !== undefined && fields.role !== 'ADMINISTRATOR'));

    const updated = removesAnAdmin
      ? await prisma.$transaction(
          async (tx) => {
            const otherActiveAdmins = await tx.user.count({ where: { role: 'ADMINISTRATOR', isActive: true, NOT: { id: target.id } } });
            if (otherActiveAdmins === 0) return null;
            return tx.user.update({ where: { id: target.id }, data: fields, select: USER_SELECT });
          },
          { isolationLevel: 'Serializable' },
        )
      : await prisma.user.update({ where: { id: target.id }, data: fields, select: USER_SELECT });

    if (!updated) {
      return res.status(409).json({ error: { code: 'LAST_ACTIVE_ADMIN_BLOCKED', message: 'At least one Administrator must stay active' } });
    }
    res.status(200).json(updated);
  } catch (error) {
    if (errorCode(error) === 'P2002') return res.status(409).json(EMAIL_TAKEN);
    // Postgres refused one of two simultaneous serializable changes; nothing was saved.
    if (errorCode(error) === 'P2034') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Another change was saved at the same time. Please try again.' } });
    }
    console.error('PATCH /api/users/:id failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to update user' } });
  }
});

router.post('/:id/reset-password', ...adminOnly, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null || !(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) {
      return res.status(404).json(USER_NOT_FOUND);
    }

    // FR-20: a new one-time password the user must change at next login. Sessions opened with the
    // old password end now (api-spec.md 6).
    const initialPassword = generateInitialPassword();
    const passwordHash = await hashPassword(initialPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    res.status(200).json({ initialPassword });
  } catch (error) {
    console.error('POST /api/users/:id/reset-password failed:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to set a new password' } });
  }
});

export default router;
