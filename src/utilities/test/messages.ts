import { Message } from 'ably';

import { MODELS_EVENT_UUID_HEADER } from '../../types/optimistic.js';

export const baseMessage: Message = {
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

export function createMessage(i: number): Message {
  const headers: { [key: string]: string } = {};
  headers[MODELS_EVENT_UUID_HEADER] = `id_${i}`;

  return {
    ...baseMessage,
    id: `${i}`,
    name: `name_${i}`,
    data: `data_${i}`,
    extras: { headers: headers },
  };
}

export function customMessage(id: string, name: string, data: string, headers?: Record<string, string>): Message {
  const baseHeaders: { [key: string]: string } = {};
  baseHeaders[MODELS_EVENT_UUID_HEADER] = id;

  return {
    ...baseMessage,
    id,
    name,
    data,
    extras: {
      ...baseMessage.extras,
      headers: {
        ...baseMessage.extras.headers,
        ...baseHeaders,
        ...(headers || {}),
      },
    },
  };
}
