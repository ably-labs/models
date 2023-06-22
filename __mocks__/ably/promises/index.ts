import { Types } from 'ably/promises';

const mockPromiseErrorNotImplemented = <T>(name: string): Promise<T> => new Promise((_, reject) => reject(new Error(`mock '${name}' not implemented`)));
const mockNotImplemented = <T>(name: string): T => { throw new Error(`mock ${name} not implemented`) };

type MockChannel = Partial<Types.RealtimeChannelPromise>;

const mockChannel: MockChannel = {
	on: () => mockNotImplemented<void>('on'),
	attach: () => mockPromiseErrorNotImplemented<void>('attach'),
	detach: () => mockPromiseErrorNotImplemented<void>('detach'),
	subscribe: () => mockPromiseErrorNotImplemented<void>('subscribe'),
}

type MockChannels = Partial<Types.Channels<MockChannel>>;

const mockChannels: MockChannels = {
	get: () => mockChannel,
	getDerived: () => mockChannel,
	release: () => mockNotImplemented<void>('release'),
}

type MockConnection = Partial<Types.ConnectionPromise>;

const mockConnection: MockConnection = {
	whenState: () => mockPromiseErrorNotImplemented<Types.ConnectionStateChange>('whenState')
}

class MockRealtime {	
	public channels = mockChannels;
	public connection = mockConnection;
}

export { MockRealtime as Realtime };
