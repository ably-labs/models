'use client';

import { useEffect, useState } from 'react';
import { ConfirmedEvent, Model, OptimisticEvent, SyncReturnType } from '@ably-labs/models';
import { modelsClient } from './modelsClient';
import { fetchComments } from '../Drawer/actions';
import { CommentData } from '../Drawer/Comment';

type ModelType = Model<(id: number) => SyncReturnType<CommentData[]>>;

export enum CommentsMergeEvent {
  POST_COMMENT = 'postComment',
}

export const useCommentsModel = (issueId: number | null): [CommentData[] | undefined, ModelType | undefined] => {
  const [comments, setComments] = useState<CommentData[]>();
  const [model, setModel] = useState<ModelType>();

  useEffect(() => {
    if (!issueId) return;

    const model = modelsClient().models.get({
      name: `comments:${issueId}`,
      channelName: `comments:${issueId}`,
      sync: fetchComments,
      // @ts-ignore - types to be fixed for merge functions later in COL-651 https://ably.atlassian.net/browse/COL-651
      merge,
    });

    setModel(model);
  }, [issueId]);

  useEffect(() => {
    if (!issueId || !model) return;

    const fetchIssue = async (id: number) => {
      await model.sync(id);
    };
    fetchIssue(issueId);
  }, [issueId, model]);

  useEffect(() => {
    if (!model) return;

    const subscribe = (err: Error | null, data?: CommentData[] | undefined) => {
      if (err) return console.error(err);
      setComments(data);
    };

    model.subscribe(subscribe);

    return () => {
      model.unsubscribe(subscribe);
    };
  }, [model]);

  return [comments, model];
};

const merge = (state: CommentData[], event: OptimisticEvent | ConfirmedEvent): CommentData[] => {
  if (event.name === CommentsMergeEvent.POST_COMMENT) {
    return [event.data, ...state];
  }

  return state;
};
