import Stream, { IStream, StreamOptions } from './Stream.js';
import { OptionalFieldsExcept, OptionalValues } from '../types/helpers.js';

export interface IStreamFactory {
  newStream(options: Pick<StreamOptions, 'channelName'>): IStream;
}

/**
 * The StreamFactory class creates Stream instances that are
 * used to deliver change events to a model.
 */
export default class StreamFactory implements IStreamFactory {
  /**
   * @param {StreamFactoryOptions} options - The base options used when instantiating a stream.
   */
  constructor(private readonly options: Omit<StreamOptions, 'channelName'>) {
    if (this.options.eventBufferOptions.bufferMs < 0) {
      throw new Error(`EventBufferOptions bufferMs cannot be less than zero: ${this.options.eventBufferOptions.bufferMs}`);
    }
    if (this.options.syncOptions.historyPageSize <= 0 || this.options.syncOptions.historyPageSize > 1000) {
      throw new Error(`SyncOptions historyPageSize ${this.options.syncOptions.historyPageSize} must be > 0 and <= 1000`);
    }
  }

  /**
   * Create a new Stream instance for the given channel.
   * @param {Pick<StreamOptions, 'channel'>} options - Field-level overrides of the base options used to instantiate the stream.
   * @returns {IStream} The newly created stream instance.
   */
  newStream(options: OptionalValues<OptionalFieldsExcept<StreamOptions, 'channelName'>, 'eventBufferOptions' | 'syncOptions'>) {
    return new Stream(Object.assign(this.options, options));
  }
}
