import { useState, useEffect } from 'react';
import { assertConfiguration } from '@ably-labs/react-hooks';
import type { Post as PostType } from '@/lib/prisma/api';
import * as Mutations from '@/lib/models/mutations';
import * as Updates from './updates';
import Models, { Model } from '@ably-labs/models';
import { configureAbly } from '@ably-labs/react-hooks';

configureAbly({ key: process.env.NEXT_PUBLIC_ABLY_API_KEY });

export type ModelType = Model<PostType, typeof Mutations>;

export async function getPost(id: number) {
  const response = await fetch(`/api/posts/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`GET /api/posts/:id: ${response.status} ${JSON.stringify(await response.json())}`);
  }
  const { data } = (await response.json()) as { data: PostType };
  return { data, version: 1 }; // TODO remove version requirement
}

export const useModel = (id: number) => {
  const [model, setModel] = useState<ModelType>();

  useEffect(() => {
    const ably = assertConfiguration();
    const models = new Models({ ably });
    const init = async () => {
      const model = models.Model<PostType, typeof Mutations>(`post:${id}`);
      await model.$register({
        $sync: async () => getPost(id),
        $update: {
          comments: {
            add: Updates.addComment,
            edit: Updates.editComment,
            delete: Updates.deleteComment,
          },
        },
        $mutate: {
          addComment: {
            func: Mutations.addComment,
            options: { timeout: 2000 },
          },
          editComment: {
            func: Mutations.editComment,
            options: { timeout: 2000 },
          },
          deleteComment: {
            func: Mutations.deleteComment,
            options: { timeout: 2000 },
          },
        },
      });
      setModel(model);
    };
    if (!model) {
      init();
    }
    // return () => {
    // 	// disposing creates problems ObjectUnsubscribedError: object unsubscribed when model.subscribe called
    //   model?.$dispose()
    // };
  });
  return model;
};
