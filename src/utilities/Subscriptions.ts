import { Types } from 'ably/promises';
import { EventListener } from './EventEmitter';

export type SubscriptionMessageEvent<T> = {
  message: T;
  error?: never;
};

export type SubscriptionErrorEvent = {
  message?: never;
  error: Types.ErrorInfo;
};

export type SubscriptionEvent<T> = SubscriptionMessageEvent<T> | SubscriptionErrorEvent;

export type ListenerPair<T> = {
  message: EventListener<T | undefined>;
  error: EventListener<Types.ErrorInfo | undefined>;
};
