import type { ExpectStatic } from 'vitest';

import { toEventsWithoutUUID } from './events.js';
import type { Event } from '../../types/model.js';
import { MatcherResult } from '../../types/test/vitest.js';

export function addCustomMatchers(expect: ExpectStatic) {
  expect.extend({
    toEqualIgnoringUUID(received: Event[], expected: Event[]): MatcherResult<Event[]> {
      const pass = this.equals(toEventsWithoutUUID(received), expected);
      return {
        message: () => (pass ? '' : `expected ${received} to deeply equal ${expected}`),
        pass,
        actual: received,
        expected: expected,
      };
    },
  });
}
