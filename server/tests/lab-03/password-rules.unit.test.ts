import { describe, it, expect } from 'vitest';
import { validatePassword } from '../../src/auth/password-rules';

const valid = (n: number) => 'a1'.repeat(Math.ceil(n / 2)).slice(0, n);

describe('validatePassword (UNIT-01, BR-10)', () => {
  it('accepts a password at both length boundaries (8 and 72)', () => {
    expect(validatePassword(valid(8)).valid).toBe(true);
    expect(validatePassword(valid(72)).valid).toBe(true);
  });

  it('rejects a password just outside the length boundaries (7 and 73)', () => {
    expect(validatePassword(valid(7)).errors).toContain('password must be 8-72 characters');
    expect(validatePassword(valid(73)).errors).toContain('password must be 8-72 characters');
  });

  it('rejects a password with no letter', () => {
    expect(validatePassword('12345678').errors).toContain('password must contain at least one letter');
  });

  it('rejects a password with no digit', () => {
    expect(validatePassword('abcdefgh').errors).toContain('password must contain at least one digit');
  });

  it('accepts a password with at least one letter and one digit, no special character required', () => {
    const result = validatePassword('abcdefg1');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a non-string value without throwing', () => {
    expect(() => validatePassword(undefined)).not.toThrow();
    expect(validatePassword(undefined).valid).toBe(false);
  });

  it('returns every violation together, not just the first', () => {
    const result = validatePassword('1234567');
    expect(result.errors).toEqual([
      'password must be 8-72 characters',
      'password must contain at least one letter',
    ]);
  });
});
