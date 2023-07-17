import { useState, useEffect } from 'react';
import { assertConfiguration } from '@ably-labs/react-hooks';
import type { PostWithComments } from '@/lib/prisma/api';
import { getPost, addComment, editComment, deleteComment } from '@/lib/api';
import Models, { Model } from '@ably-labs/models';
import { User } from '@prisma/client';

type Mutations = {
  addComment: (...args: Parameters<typeof addComment>) => Promise<void>;
  editComment: (...args: Parameters<typeof editComment>) => Promise<void>;
  deleteComment: (...args: Parameters<typeof deleteComment>) => Promise<void>;
};

export const usePost = (id: number) => {
  const [model, setModel] = useState<Model<PostWithComments, Mutations> | undefined>(undefined);

  useEffect(() => {
    const ably = assertConfiguration();
    const models = new Models({ ably });
    const init = async () => {
      const model = models.Model<PostWithComments, Mutations>(`post:${id}`);
      await model.$register({
        $sync: async () => getPost(id),
        $update: {
          comments: {
            add: async (state, event) => ({
              ...state,
              comments: state.comments.concat([event.data]),
            }),
            edit: async (state, event) => ({
              ...state,
              comments: state.comments.map((comment) =>
                comment.id === event.data.id ? { ...comment, content: event.data.content } : comment,
              ),
            }),
            delete: async (state, event) => ({
              ...state,
              comments: state.comments.filter((comment) => comment.id !== event.data.id),
            }),
          },
        },
        $mutate: {
          addComment: {
            func: async (author: User, postId: number, content: string) => {
              addComment(author, postId, content);
            },
            options: { timeout: 2000 },
          },
          editComment: {
            func: async (id: number, content: string) => {
              editComment(id, content);
            },
            options: { timeout: 2000 },
          },
          deleteComment: {
            func: async (id: number) => {
              deleteComment(id);
            },
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
