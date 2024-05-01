import ModelsClient, { Model, SyncReturnType } from '@ably-labs/models';
import { backoffRetryStrategy } from '@ably-labs/models';
import {useAbly} from "ably/react"
import { useState, useEffect } from 'react';
import { merge } from '@/lib/models/mutations';
import type { Post as PostType } from '@/lib/prisma/api';

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
  const { sequenceId, data } = (await response.json()) as { sequenceId: string; data: PostType };

  return { sequenceId, data };
}

export const useModel = (id: number) => {
  const ably = useAbly()
  const [model, setModel] = useState<ModelType>();

  useEffect(() => {
    const modelsClient = new ModelsClient({
      ably,
      logLevel: 'trace',
      optimisticEventOptions: { timeout: 5000 },
      syncOptions: { retryStrategy: backoffRetryStrategy(2, 125, -1, 1000) },
    });
    const init = async () => {
      const model = modelsClient.models.get({
        channelName: `${channelNamespace}post:${id}`,
        sync: async () => getPost(id),
        merge,
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
