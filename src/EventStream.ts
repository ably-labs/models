import { Types } from 'ably';
import EventStreamOptions from './options/EventStreamOptions';
import EventEmitter from './utilities/EventEmitter';

const EVENT_STREAM_OPTIONS_DEFAULTS = {};

enum EventStreamState {
  /**
   * The event stream has been initialized but no attach has yet been attempted.
   */
  INITIALIZED = 'initialized',
  /**
   * This state is entered if the event stream encounters a failure condition that it cannot recover from.
   */
  FAILED = 'failed',
}

class EventStream<T> extends EventEmitter<any> {
  private options: EventStreamOptions;
  private connectionId?: string;
  private state: EventStreamState = EventStreamState.INITIALIZED;
  private data: T;

  constructor(readonly name: string, readonly client: Types.RealtimePromise, options: EventStreamOptions) {
    super();
    this.options = { ...EVENT_STREAM_OPTIONS_DEFAULTS, ...options };
    this.connectionId = this.client.connection.id;
  }
}

export default EventStream;
