import ModelsClient from '@ably-labs/models';
import { Realtime } from 'ably';

const ably = new Realtime({ key: process.env.NEXT_PUBLIC_ADBC_ABLY_API_KEY });
export const modelsClient = new ModelsClient({ ably });
