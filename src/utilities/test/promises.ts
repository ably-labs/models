import { Subject, lastValueFrom, take } from 'rxjs';

import { EventListener } from '../EventEmitter.js';

export const getNthEventPromise = <T>(subject: Subject<T>, n: number) => lastValueFrom(subject.pipe(take(n)));

export const getEventPromises = <T>(subject: Subject<T>, n: number) => {
  const promises: Promise<T>[] = [];
  for (let i = 0; i < n; i++) {
    promises.push(getNthEventPromise(subject, i + 1));
  }
  return promises;
};

interface StateListener<T, S> {
  state: S;
  whenState(targetState: S, currentState: S, listener: EventListener<T>, ...listenerArgs: unknown[]): void;
}

export const statePromise = <T, S>(object: StateListener<T, S>, state: S) =>
  new Promise((resolve) => object.whenState(state, object.state, resolve));

export const timeout = (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms));
