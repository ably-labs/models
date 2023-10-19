import { EventListener } from './EventEmitter.js';

interface StateListener<T, S> {
  state: S;
  whenState(targetState: S, currentState: S, listener: EventListener<T>, ...listenerArgs: unknown[]): void;
}

export const statePromise = <T, S>(object: StateListener<T, S>, state: S) =>
  new Promise((resolve) => object.whenState(state, object.state, resolve));

export const timeout = (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms));
