import ModelsClient, { Model, SyncReturnType } from '@ably-labs/models';
import { backoffRetryStrategy } from '@ably-labs/models';
import { assertConfiguration } from '@ably-labs/react-hooks';
import { configureAbly } from '@ably-labs/react-hooks';
import { useState, useEffect } from 'react';

import { merge } from '@/lib/models/mutations';
import type { Post as PostType } from '@/lib/prisma/api';

configureAbly({ key: process.env.NEXT_PUBLIC_ABLY_API_KEY });

const channelNamespace = process.env.NEXT_PUBLIC_ABLY_CHANNEL_NAMESPACE ? `${process.env.NEXT_PUBLIC_ABLY_CHANNEL_NAMESPACE}:` : '';

export type ModelType = Model<() => SyncReturnType<PostType>>;

export async function getPost(id: number) {
  const response = await fetch(`/api/posts/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`GET /api/posts/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  const { sequenceID, data } = (await response.json()) as { sequenceID: string; data: PostType };

  return { sequenceID, data };
}

export const useModel = (id: number) => {
  const [model, setModel] = useState<ModelType>();

  useEffect(() => {
    const ably = assertConfiguration();
    const modelsClient = new ModelsClient({
      ably,
      logLevel: 'trace',
      optimisticEventOptions: { timeout: 5000 },
      syncOptions: { retryStrategy: backoffRetryStrategy(2, 125, -1, 1000) },
    });
    const init = async () => {
      const model = modelsClient.models.get({
        name: `post:${id}`,
        channelName: `${channelNamespace}post:${id}`,
        sync: async () => getPost(id),
        merge: merge,
      });
      await model.sync();

      setModel(model);
    };

    if (!model) {
      init();
    }
    return () => {
      model?.dispose();
    };
  });
  return model;
};
