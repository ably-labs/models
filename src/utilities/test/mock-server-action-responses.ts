const authAction = (override) => {
  return {
    action: 4,
    connectionId: 'CONNDESC',
    connectionKey: 'CONNECTIONKEY',
    connectionSerial: -1,
    connectionDetails: {
      clientId: 'RND-CLIENTID',
      connectionKey: 'randomKey',
      maxMessageSize: 131000,
      maxInboundRate: 1000,
      maxOutboundRate: 1000,
      maxFrameSize: 262144,
      connectionStateTtl: 120000,
      maxIdleInterval: 15000,
    },
    ...override,
  };
};

export { authAction };
