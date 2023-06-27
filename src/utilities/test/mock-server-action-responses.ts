import { Actions } from './protocol.js';
import { baseProtocolMessage } from './messages.js';

const authAction = (override) => {
  return {
    ...baseProtocolMessage,
    action: Actions.CONNECTED,
    ...override,
  };
};

const attachedAction = (override) => {
  return {
    ...baseProtocolMessage,
    action: Actions.ATTACHED,
    ...override,
  };
};

const detachedAction = (override) => {
  return {
    ...baseProtocolMessage,
    action: Actions.DETACHED,
    ...override,
  };
};

const ackAction = (override) => {
  return {
    ...baseProtocolMessage,
    action: Actions.ACK,
    ...override,
  };
};

const messageAction = (override) => {
  return {
    ...baseProtocolMessage,
    action: Actions.MESSAGE,
    ...override,
  };
};

export { authAction, attachedAction, detachedAction, ackAction, messageAction };
