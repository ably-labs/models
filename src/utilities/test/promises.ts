import { Subject, lastValueFrom, take } from 'rxjs';

export const getNthEventPromise = <T>(subject: Subject<T>, n: number) => lastValueFrom(subject.pipe(take(n)));

export const getEventPromises = <T>(subject: Subject<T>, n: number) => {
  const promises: Promise<T>[] = [];
  for (let i = 0; i < n; i++) {
    promises.push(getNthEventPromise(subject, i + 1));
  }
  return promises;
};

export async function foreachSync(data: any[], callback: Function): Promise<void> {
  for (let i = 0; i < data.length; i++) {
    await callback(data[i]);
  }

  return;
}
