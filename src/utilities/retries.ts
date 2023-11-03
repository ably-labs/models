import { RetryStrategyFunc } from '../types/optimistic.js';

/**
 * fixedRetryStrategy returns the same retry duration for all attempts up to the maxAttempts.
 * @param {number} durationMs - the fixed duration in milliseconds of each retry wait time.
 * @param {number} maxAttempts - the total number of retry attempts allowed. Defaults to -1, indicating infinite retries.
 * @returns {RetryStrategyFunc} - the strategy function
 */
export function fixedRetryStrategy(durationMs: number, maxAttempts: number = -1): RetryStrategyFunc {
  return (attempts) => {
    if (maxAttempts >= 0 && attempts > maxAttempts) {
      return -1;
    }

    return durationMs;
  };
}

/**
 * backoffRetryStrategy returns a RetryStrategyFunc configured for backoff retry.
 * The strategy function calculates the next backoff duration in milliseconds given
 * the attempt number. For example; backoffFactor=2, initialDuration=1000 would return
 * in order for each increasing attempt number: 1000, 2000, 4000, 8000, 16000, etc.
 * But using the same arguments with maxDuration=4000 would return: 1000, 2000, 4000, 4000, 4000, etc.
 * @param {number} backoffFactor - the factor by which to increase the backoff.
 * @param {number} initialDuration - the first retry wait time duration in milliseconds.
 * @param {number} maxAttempts - the total number of retry attempts allowed. Defaults to -1, indicating infinite retries.
 * @param {number} maxDuration - the upper limit on the wait time duration in milliseconds, defaults to 1 minute.
 */
export function backoffRetryStrategy(
  backoffFactor: number,
  initialDuration: number,
  maxAttempts: number = -1,
  maxDuration: number = 60000,
): RetryStrategyFunc {
  return (attempts) => {
    if (maxAttempts >= 0 && attempts > maxAttempts) {
      return -1;
    }

    const backoffDuration = Math.min(initialDuration * Math.pow(backoffFactor, attempts - 1), maxDuration);

    return backoffDuration;
  };
}
