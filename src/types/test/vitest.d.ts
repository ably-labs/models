import type { Event } from '../model';

interface MatcherResult<R> {
  pass: boolean;
  message: () => string;
  actual?: R;
  expected?: R;
}

// extend vitest's `expect` with customer matchers
interface CustomMatchers {
  toEqualIgnoringUUID(events: Event[]): MatcherResult<Event[]>;
}

declare module 'vitest' {
  interface Assertion extends CustomMatchers {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
