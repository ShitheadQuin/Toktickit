// BR-10: 8-72 characters, at least one letter and one digit. No forced special character -
// there is no self-service reset path in Lab 3, so a rule the user can't work around alone would
// risk a permanent lockout. 72 is bcrypt's input limit.
export function validatePassword(password: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const value = typeof password === 'string' ? password : '';

  if (value.length < 8 || value.length > 72) {
    errors.push('password must be 8-72 characters');
  }
  if (!/[a-zA-Z]/.test(value)) {
    errors.push('password must contain at least one letter');
  }
  if (!/[0-9]/.test(value)) {
    errors.push('password must contain at least one digit');
  }

  return { valid: errors.length === 0, errors };
}
