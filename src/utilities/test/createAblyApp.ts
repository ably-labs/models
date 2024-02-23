import ky from 'ky';

export const createAblyApp = async (json: Options): Promise<Data> => {
  const response = await ky
    .post('https://sandbox-rest.ably.io/apps', {
      json,
      headers: {
        'content-type': 'application/json',
        Accept: 'application/json',
      },
    })
    .json<Data>();
  return response;
};

interface Key {
  capability?: {
    private: ('subscribe' | 'publish')[];
    chat?: 'presence'[];
  };
}

interface Namespace {
  id: string;
  persisted: boolean;
}

interface Presence {
  clientId: string;
  data: string;
}

interface Channel {
  name: string;
  presence: Presence[];
}

interface Options {
  keys?: Key[];
  namespaces?: Namespace[];
  channels?: Channel[];
}

interface Data {
  status: number;
  created: Date;
  modified: Date;
  tlsOnly: boolean;
  labels: string;
  enablePusherCompatibility: boolean;
  namespaces: {
    id: string;
    created: Date;
    modified: Date;
    expires: Date | null;
    persisted: boolean;
    persistLast: boolean;
    pushEnabled: boolean;
    exposeTimeserial: boolean;
    populateChannelRegistry: boolean;
    tlsOnly: boolean;
    authenticated: boolean;
    identified: boolean;
    cursorEventProcessing: boolean;
  }[];
  metaChannels: any;
  id: string;
  appId: string;
  accountId: string;
  keys: {
    id: string;
    value: string;
    keyName: string;
    keySecret: string;
    keyStr: string;
    capability: string;
    expires: Date;
  }[];
  connections: {
    name: string;
    key: string;
  }[];
  channels: {
    name: string;
    presence: Presence[];
    connection: string;
  }[];
}
