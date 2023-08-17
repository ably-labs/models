import { Types } from 'ably/promises';

export const baseMessage: Types.Message = {
  id: '1',
  data: null,
  name: 'foo',
  clientId: 'RND-CLIENTID',
  connectionId: 'CONNECTION_ID',
  encoding: 'utf-8',
  extras: {
    headers: {},
  },
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

export function customMessage(id: string, name: string, data: string, headers?: Record<string, string>): Types.Message {
  return {
    ...baseMessage,
    id,
    name,
    data,
    extras: {
      ...baseMessage.extras,
      headers: {
        ...baseMessage.extras.headers,
        ...(headers || {}),
      },
    },
  };
}
