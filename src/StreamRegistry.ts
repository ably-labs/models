import Stream, { IStream, StreamOptions } from './Stream.js';

export interface IStreamRegistry {
  newStream(options: Pick<StreamOptions, 'channel'>): IStream;
  //get streams(): { [key: string]: IStream };
}

/**
 * The StreamRegistry class encapsulates a set of names stream instances that are
 * used to deliver change events to a model.
 */
export default class StreamRegistry implements IStreamRegistry {
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
   * Retrieve an existing stream instance for the given channel or create a new one if it doesn't yet exist.
   * @param {Pick<StreamOptions, 'channel'>} options - The options used in conjunction with the default options when instantiating a stream
   * @returns {IStream} The pre-existing or newly created stream instance.
   */
  // TODO: should this cache the streams?
  newStream(options: Pick<StreamOptions, 'channel'>) {
    return new Stream(Object.assign(this.options, options));
  }
}
