import Stream, { IStream, StreamOptions } from './Stream.js';

export interface IStreamRegistry {
  getOrCreate(options: Pick<StreamOptions, 'channel'>): IStream;
  get streams(): { [key: string]: IStream };
}

export default class StreamRegistry implements IStreamRegistry {
  private _streams: { [key: string]: IStream } = {};

  constructor(readonly options: Pick<StreamOptions, 'ably' | 'logger'>) {}

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
