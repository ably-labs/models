import Stream, { IStream, StreamOptions } from './Stream.js';

/**
 * @internal
 */
export interface IStreamRegistry {
  getOrCreate(options: Pick<StreamOptions, 'channel'>): IStream;
  get streams(): { [key: string]: IStream };
}

/**
 * The StreamRegistry class encapsulates a set of names {@link Stream} instances that are
 * used to deliver change events to a model.
 *
 * @internal
 */
export default class StreamRegistry implements IStreamRegistry {
  private _streams: { [key: string]: IStream } = {};

  /**
   * @param {Pick<StreamOptions, 'ably' | 'logger'>} options - The default options used when instantiating a {@link Stream}.
   */
  constructor(readonly options: Pick<StreamOptions, 'ably' | 'logger'>) {}

  /**
   * Retrieve an existing {@link Stream} instance for the given channel or create a new one if it doesn't yet exist.
   * @param {Pick<StreamOptions, 'channel'>} options - The options used in conjunction with the default options when instantiating a {@link Stream}
   * @returns {IStream} The pre-existing or newly created {@link Stream} instance.
   */
  getOrCreate(options: Pick<StreamOptions, 'channel'>) {
    if (!this._streams[options.channel]) {
      this._streams[options.channel] = new Stream(Object.assign(this.options, options));
    }
    return this._streams[options.channel];
  }

  public get streams() {
    return this._streams;
  }
}
