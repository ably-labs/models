import { Types } from 'ably/promises';
import { Flags } from './protocol';

export const baseProtocolMessage = {
  flags: Flags.PRESENCE | Flags.PUBLISH | Flags.SUBSCRIBE | Flags.PRESENCE_SUBSCRIBE,
  id: 'PROTOCOL_MESSAGE_ID',
  timestamp: 1,
  count: 1,
  connectionId: 'CONNECTION_ID',
  channel: 'foobar',
  channelSerial: 'CHANNEL_SERIAL',
  msgSerial: 1,
  connectionDetails: {
    clientId: '',
    connectionKey: 'randomKey',
    maxMessageSize: 131000,
    maxInboundRate: 1000,
    maxOutboundRate: 1000,
    maxFrameSize: 262144,
    connectionStateTtl: 120000,
    maxIdleInterval: 15000,
  },
};

export const baseMessage: Types.Message = {
  id: '1',
  data: null,
  name: 'foo',
  clientId: 'RND-CLIENTID',
  connectionId: 'CONNECTION_ID',
  encoding: 'utf-8',
  extras: {},
  timestamp: 1,
};

export function createMessage(i: number): Types.Message {
  return {
    ...baseMessage,
    id: `id_${i}`,
    name: `name_${i}`,
    data: `data_${i}`,
  };
}
