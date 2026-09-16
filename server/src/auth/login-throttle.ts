// BR-08/AC-25: 5 failed attempts per email within a 15-minute sliding window blocks further
// attempts for that email until the oldest one ages out of the window - deliberately in-memory
// (not a table), since this is a single-process local-dev app and a restart clearing the counters
// is an acceptable tradeoff for not adding a migration for pure anti-brute-force hardening.
// Keyed by email rather than user id because BR-08 must also throttle emails with no account, to
// avoid revealing which emails exist by whether throttling kicks in.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

function recentAttempts(email: string, now: number): number[] {
  const timestamps = attempts.get(email) ?? [];
  return timestamps.filter((t) => now - t < WINDOW_MS);
}

export function isThrottled(email: string, now: number = Date.now()): boolean {
  return recentAttempts(email, now).length >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(email: string, now: number = Date.now()): void {
  attempts.set(email, [...recentAttempts(email, now), now]);
}

export function resetAttempts(email: string): void {
  attempts.delete(email);
}
