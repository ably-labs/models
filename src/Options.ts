import { numericOtherwiseLexicographicOrderer } from './stream/Middleware.js';
import type { OptimisticEventOptions, SyncOptions } from './types/optimistic.js';
import type { EventBufferOptions } from './types/stream.js';

export const defaultSyncOptions: SyncOptions = {
  historyPageSize: 100,
};

export const defaultEventBufferOptions: EventBufferOptions = {
  bufferMs: 0,
  eventOrderer: numericOtherwiseLexicographicOrderer,
};

export const defaultOptimisticEventOptions: OptimisticEventOptions = {
  timeout: 2 * 60 * 1000,
};