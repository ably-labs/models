import Stream, { IStream, StreamOptions } from './Stream.js';

export interface IStreamFactory {
  newStream(options: Pick<StreamOptions, 'channel'>): IStream;
}

/**
 * The StreamFactory class creates Stream instances that are
 * used to deliver change events to a model.
 */
export default class StreamFactory implements IStreamFactory {
  /**
   * @param {Pick<StreamOptions, 'ably' | 'logger'>} options - The default options used when instantiating a stream.
   */
  constructor(private readonly options: Pick<StreamOptions, 'ably' | 'logger' | 'eventBufferOptions'>) {
    if (options.eventBufferOptions) {
      const bufferMs = options.eventBufferOptions?.bufferMs || 0;
      if (bufferMs < 0) {
        throw new Error(`EventBufferOptions bufferMs cannot be less than zero: ${bufferMs}`);
      }
    }
  }

  /**
   * Create a new Stream instance for the given channel.
   * @param {Pick<StreamOptions, 'channel'>} options - The options used in conjunction with the default options when instantiating a stream
   * @returns {IStream} The newly created stream instance.
   */
  newStream(options: Pick<StreamOptions, 'channel'>) {
    return new Stream(Object.assign(this.options, options));
  }
}
