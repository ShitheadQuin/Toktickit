import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12; // BR-09

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export function comparePassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

// BR-06: a bcrypt comparison runs even for an unknown email, against this fixed dummy hash, so
// response time cannot be used to tell an unknown email apart from a wrong password. Computed
// once at module load, from an arbitrary string that is never used as a real password.
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);
