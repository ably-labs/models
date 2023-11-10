import pino from 'pino';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import EventQueue from './EventQueue.js';
import { ConfirmedEvent } from './types/model.js';
import type { ResolveFn } from './types/promises.js';

describe('EventQueue', () => {
  let eventQueue: EventQueue;
  const logger = pino({ level: 'silent' });
  const eventHandlerMock = vi.fn();

  beforeEach(() => {
    eventQueue = new EventQueue(logger, eventHandlerMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should enqueue and process events', async () => {
    const event1: ConfirmedEvent = { sequenceID: '1', mutationID: '1', name: 'foo', confirmed: true, rejected: false };
    const event2: ConfirmedEvent = { sequenceID: '2', mutationID: '2', name: 'bar', confirmed: true, rejected: true };

    eventQueue.enqueue(event1);
    eventQueue.enqueue(event2);

    await new Promise(process.nextTick);

    expect(eventHandlerMock).toHaveBeenCalledWith(null, event1);
    expect(eventHandlerMock).toHaveBeenCalledWith(null, event2);
  });

  it('should handle errors thrown by eventHandler', async () => {
    const error = new Error('Test Error');
    eventHandlerMock.mockRejectedValueOnce(error);

    const event: ConfirmedEvent = { sequenceID: '1', mutationID: '1', name: 'foo', confirmed: true, rejected: false };
    eventQueue.enqueue(event);

    await new Promise(process.nextTick);

    expect(eventHandlerMock).toHaveBeenCalledWith(error, event);
  });

  it('should not process new events while already processing', async () => {
    const event1: ConfirmedEvent = { sequenceID: '1', mutationID: '1', name: 'foo', confirmed: true, rejected: false };
    const event2: ConfirmedEvent = { sequenceID: '2', mutationID: '2', name: 'bar', confirmed: true, rejected: true };
    let complete: ResolveFn<void> | undefined;
    eventHandlerMock.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)));

    eventQueue.enqueue(event1);
    eventQueue.enqueue(event2);

    await new Promise(process.nextTick);
    expect(eventHandlerMock).toHaveBeenCalledTimes(1);
    expect(complete).toBeDefined();
    complete!();
    await new Promise(process.nextTick);
    expect(eventHandlerMock).toHaveBeenCalledTimes(2);
  });

  it('should reset the queue', async () => {
    const event1: ConfirmedEvent = { sequenceID: '1', mutationID: '1', name: 'foo', confirmed: true, rejected: false };
    const event2: ConfirmedEvent = { sequenceID: '2', mutationID: '2', name: 'bar', confirmed: true, rejected: true };
    let complete: ResolveFn<void> | undefined;
    eventHandlerMock.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)));

    eventQueue.enqueue(event1);
    eventQueue.enqueue(event2);

    await new Promise(process.nextTick);
    eventQueue.reset();
    complete!();

    expect(eventQueue['queue']).toHaveLength(0);
    expect(eventQueue['isProcessing']).toBe(false);
    expect(eventHandlerMock).toHaveBeenCalledTimes(1);
  });
});
