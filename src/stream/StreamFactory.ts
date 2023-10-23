import { numericOtherwiseLexicographicOrderer } from './Middleware.js';
import Stream, { EventBufferOptions, IStream, StreamOptions } from './Stream.js';
import { OptionalValues, OptionalFields, OptionalFieldsExcept } from '../types/helpers.js';
import { SyncOptions } from '../types/optimistic.js';

export const defaultSyncOptions: SyncOptions = {
  historyPageSize: 100,
};

export const defaultEventBufferOptions: EventBufferOptions = {
  bufferMs: 0,
  eventOrderer: numericOtherwiseLexicographicOrderer,
};

export interface IStreamFactory {
  newStream(options: Pick<StreamOptions, 'channelName'>): IStream;
}

type StreamFactoryOptions = OptionalValues<
  OptionalFields<StreamOptions, 'channelName' | 'syncOptions' | 'eventBufferOptions'>,
  'syncOptions'
>;

/**
 * The StreamFactory class creates Stream instances that are
 * used to deliver change events to a model.
 */
export default class StreamFactory implements IStreamFactory {
  private opts: Omit<StreamOptions, 'channelName'>;

  /**
   * @param {StreamFactoryOptions} options - The base options used when instantiating a stream.
   */
  constructor(private readonly options: StreamFactoryOptions) {
    const eventBufferOptions: EventBufferOptions = Object.assign(
      defaultEventBufferOptions,
      this.options.eventBufferOptions,
    );
    if (eventBufferOptions.bufferMs < 0) {
      throw new Error(`EventBufferOptions bufferMs cannot be less than zero: ${eventBufferOptions.bufferMs}`);
    }
    const syncOptions: SyncOptions = Object.assign(defaultSyncOptions, this.options.syncOptions);
    if (syncOptions.historyPageSize <= 0 || syncOptions.historyPageSize > 1000) {
      throw new Error(`SyncOptions historyPageSize ${syncOptions.historyPageSize} must be > 0 and <= 1000`);
    }
    this.opts = Object.assign(this.options, {
      eventBufferOptions,
      syncOptions,
    });
  }

  /**
   * Create a new Stream instance for the given channel.
   * @param {Pick<StreamOptions, 'channel'>} options - Field-level overrides of the base options used to instantiate the stream.
   * @returns {IStream} The newly created stream instance.
   */
  newStream(options: OptionalFieldsExcept<StreamOptions, 'channelName'>) {
    return new Stream(Object.assign(this.opts, options));
  }
}
