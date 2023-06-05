/**
 * AblyJS ProtocolMessage actions
 * {@link https://github.com/ably/ably-js/blob/main/src/common/lib/types/protocolmessage.ts#L7}
 */
export enum Actions {
  HEARTBEAT = 0,
  ACK,
  NACK,
  CONNECT,
  CONNECTED,
  DISCONNECT,
  DISCONNECTED,
  CLOSE,
  CLOSED,
  ERROR,
  ATTACH,
  ATTACHED,
  DETACH,
  DETACHED,
  PRESENCE,
  MESSAGE,
  SYNC,
  AUTH,
  ACTIVATE,
}

/**
 * AblyJS ProtocolMessage flags
 * {@link https://github.com/ably/ably-js/blob/main/src/common/lib/types/protocolmessage.ts#L34}
 */
export enum Flags {
  /* Channel attach state flags */
  HAS_PRESENCE = 1 << 0,
  HAS_BACKLOG = 1 << 1,
  RESUMED = 1 << 2,
  TRANSIENT = 1 << 4,
  ATTACH_RESUME = 1 << 5,
  /* Channel mode flags */
  PRESENCE = 1 << 16,
  PUBLISH = 1 << 17,
  SUBSCRIBE = 1 << 18,
  PRESENCE_SUBSCRIBE = 1 << 19,
}
