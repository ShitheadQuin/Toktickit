import { describe, it, expect, beforeEach } from 'vitest';
import { recordFailedAttempt, isThrottled, resetAttempts } from '../../src/auth/login-throttle';

const EMAIL = 'jane@toktickit.dev';
const START = Date.parse('2026-01-01T00:00:00Z');
const FIFTEEN_MIN = 15 * 60 * 1000;

describe('login throttle (UNIT-04, BR-08, AC-25)', () => {
  beforeEach(() => resetAttempts(EMAIL));

  it('allows attempts 1 through 5, then rejects the 6th, within the 15-minute window', () => {
    for (let i = 0; i < 5; i++) {
      expect(isThrottled(EMAIL, START + i * 1000)).toBe(false);
      recordFailedAttempt(EMAIL, START + i * 1000);
    }
    expect(isThrottled(EMAIL, START + 5000)).toBe(true);
  });

  it('allows the email through again once the cooldown window has elapsed', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(EMAIL, START + i * 1000);
    }
    expect(isThrottled(EMAIL, START + 5000)).toBe(true);
    expect(isThrottled(EMAIL, START + FIFTEEN_MIN + 1)).toBe(false);
  });

  it('tracks each email independently', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL, START + i * 1000);
    expect(isThrottled('other@toktickit.dev', START + 5000)).toBe(false);
  });

  it('a successful login resets the counter (resetAttempts)', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(EMAIL, START + i * 1000);
    expect(isThrottled(EMAIL, START + 5000)).toBe(true);
    resetAttempts(EMAIL);
    expect(isThrottled(EMAIL, START + 5000)).toBe(false);
  });
});
