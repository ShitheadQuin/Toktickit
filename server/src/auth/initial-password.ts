import { randomInt } from 'node:crypto';

// specification.md 11, api-spec.md 6: the initial password an Administrator creates or resets is
// generated here, never chosen by the client. Look-alike characters (0/O, 1/l/I) are left out,
// because the Administrator hands it to the user out-of-band (there is no email in Lab 3).
const LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;

export const INITIAL_PASSWORD_LENGTH = 12;

export function generateInitialPassword(): string {
  // BR-10 needs at least one letter and one digit; redraw in the rare case one is missing.
  for (;;) {
    let password = '';
    for (let i = 0; i < INITIAL_PASSWORD_LENGTH; i++) {
      password += ALPHABET[randomInt(ALPHABET.length)];
    }
    if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) return password;
  }
}
