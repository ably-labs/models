import { Channels, ConnectionStateChange, Connection, RealtimeChannel } from 'ably';

const mockPromiseErrorNotImplemented = <T>(name: string): Promise<T> => new Promise((_, reject) => reject(new Error(`mock '${name}' not implemented`)));
const mockNotImplemented = <T>(name: string): T => { throw new Error(`mock ${name} not implemented`) };

type MockChannel = Partial<RealtimeChannel>;

const mockChannel: MockChannel = {
	on: () => mockNotImplemented<void>('on'),
}

type MockChannels = Partial<Channels<MockChannel>>;

const mockChannels: MockChannels = {
	get: () => mockChannel,
	getDerived: () => mockChannel,
	release: () => mockNotImplemented<void>('release'),
}

type MockConnection = Partial<Connection>;

const mockConnection: MockConnection = {
	whenState: () => mockPromiseErrorNotImplemented<ConnectionStateChange>('whenState')
}

class MockRealtime {
	public channels = mockChannels;
	public connection = mockConnection;
	public time = () => Promise.resolve(Date.now());
}

export { MockRealtime as Realtime };
