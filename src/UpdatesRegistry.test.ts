import { it, describe, expect, beforeEach } from 'vitest';
import UpdatesRegistry, { UpdateFunc } from './UpdatesRegistry.js';
import { UpdateRegistrationError } from './Errors.js';

describe('UpdatesRegistry', () => {
  let registry: UpdatesRegistry<{ value: number }>;

  const func1: UpdateFunc<{ value: number }> = async (state) => {
    return { value: state.value + 1 };
  };

  const func2: UpdateFunc<{ value: number }> = async (state) => {
    return { value: state.value - 1 };
  };

  beforeEach(() => {
    registry = new UpdatesRegistry<{ value: number }>();
  });

  it('registers an update function correctly', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    const result = registry.get({ channel: 'channel1', event: 'event1' });
    expect(result.length).toBe(1);
    expect(result[0].targets.channel).toBe('channel1');
    expect(result[0].targets.event).toBe('event1');
    expect(result[0].func).toBe(func1);
  });

  it('registers multiple update functions for the same channel and event', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    registry.register(func2, { channel: 'channel1', event: 'event1' });
    const result = registry.get({ channel: 'channel1', event: 'event1' });
    expect(result.length).toBe(2);
    expect(result[0].targets.channel).toBe('channel1');
    expect(result[0].targets.event).toBe('event1');
    expect(result[0].func).toBe(func1);
    expect(result[1].targets.channel).toBe('channel1');
    expect(result[1].targets.event).toBe('event1');
    expect(result[1].func).toBe(func2);
  });

  it('registers and retrieves multiple update functions for multiple channels and events', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    registry.register(func2, { channel: 'channel2', event: 'event2' });
    let result = registry.get({ channel: 'channel1', event: 'event1' });
    expect(result.length).toBe(1);
    expect(result[0].targets.channel).toBe('channel1');
    expect(result[0].targets.event).toBe('event1');
    result = registry.get({ channel: 'channel2', event: 'event2' });
    expect(result.length).toBe(1);
    expect(result[0].targets.channel).toBe('channel2');
    expect(result[0].targets.event).toBe('event2');
  });

  it('returns all registered functions when no options are given', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    registry.register(func2, { channel: 'channel2', event: 'event2' });
    const result = registry.get({});
    expect(result.length).toBe(2);
  });

  it('throws an error when attempting to get a non-existent channel', async () => {
    expect(() => registry.get({ channel: 'channel1' })).toThrow(UpdateRegistrationError);
  });

  it('throws an error when attempting to get a non-existent channel, even if event is provided', async () => {
    expect(() => registry.get({ channel: 'channel1', event: 'event1' })).toThrow(UpdateRegistrationError);
  });

  it('throws an error when attempting to get a non-existent event in a valid channel', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    expect(() => registry.get({ channel: 'channel1', event: 'event2' })).toThrow(UpdateRegistrationError);
  });

  it('throws an error when attempting to get a non-existent event, even if channel is not provided', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    expect(() => registry.get({ event: 'event2' })).toThrow(UpdateRegistrationError);
  });

  it('throws an error when attempting to get a non-existent event', async () => {
    expect(() => registry.get({ event: 'event1' })).toThrow(UpdateRegistrationError);
  });

  it('throws an error when attempting to get a non-existent event, even if channel is provided', async () => {
    expect(() => registry.get({ channel: 'channel1', event: 'event1' })).toThrow(UpdateRegistrationError);
  });

  it('returns all functions in a channel when no event is specified', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    registry.register(func2, { channel: 'channel1', event: 'event2' });
    const result = registry.get({ channel: 'channel1' });
    expect(result.length).toBe(2);
  });

  it('returns all functions for an event across all channels when no channel is specified', async () => {
    registry.register(func1, { channel: 'channel1', event: 'event1' });
    registry.register(func2, { channel: 'channel2', event: 'event1' });
    const result = registry.get({ event: 'event1' });
    expect(result.length).toBe(2);
  });
});
