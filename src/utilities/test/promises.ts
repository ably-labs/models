import { Subject, lastValueFrom, take } from 'rxjs';

import type Model from '../../Model.js';
import type { ModelState } from '../../types/model.js';
import type { MutationMethods } from '../../types/mutations.js';

export const getNthEventPromise = <T>(subject: Subject<T>, n: number) => lastValueFrom(subject.pipe(take(n)));

export const getEventPromises = <T>(subject: Subject<T>, n: number) => {
  const promises: Promise<T>[] = [];
  for (let i = 0; i < n; i++) {
    promises.push(getNthEventPromise(subject, i + 1));
  }
  return promises;
};

export const modelStatePromise = <T, M extends MutationMethods>(model: Model<T, M>, state: ModelState) =>
  new Promise((resolve) => model.whenState(state, model.state, resolve));

export const timeout = (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms));
