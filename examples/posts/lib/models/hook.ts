import { useState, useEffect } from 'react';
import { assertConfiguration } from '@ably-labs/react-hooks';
import type { Post as PostType } from '@/lib/prisma/api';
import ModelsClient, { Model } from '@ably-labs/models';
import { configureAbly } from '@ably-labs/react-hooks';
import { merge } from '@/lib/models/mutations';

configureAbly({ key: process.env.NEXT_PUBLIC_ABLY_API_KEY });

export type ModelType = Model<PostType>;

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
    const modelsClient = new ModelsClient({ ably, optimisticEventOptions: { timeout: 5000 } });
    const init = async () => {
      const model = await modelsClient.models.get<PostType>({
        name: `post:${id}`,
        channelName: `post:${id}`,
        sync: async () => getPost(id),
        merge: merge,
      });

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
