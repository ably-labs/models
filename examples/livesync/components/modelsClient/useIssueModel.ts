'use client';

import { useEffect, useState } from 'react';
import { ConfirmedEvent, Model, OptimisticEvent, SyncReturnType } from '@ably-labs/models';
import { modelsClient } from './modelsClient';
import { IssueType } from '../Table';
import { fetchIssueById } from '../Drawer/actions';

type ModelType = Model<(id: number) => SyncReturnType<IssueType>>;

export enum MergeEvent {
  UPDATE_ISSUE = 'updateIssue',
  UPDATE_INPUT = 'updateInput',
}

export const useIssueModel = (issueId: number | null): [IssueType | undefined, ModelType | undefined] => {
  const [issueData, setIssue] = useState<IssueType>();
  const [model, setModel] = useState<ModelType>();

  useEffect(() => {
    if (!issueId) return;

    const model: ModelType = modelsClient.models.get({
      name: `issue:${issueId}`,
      channelName: `issue:${issueId}`,
      sync: fetchIssueById,
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

    const subscribe = (err: Error | null, data?: IssueType | undefined) => {
      if (err) return console.error(err);
      setIssue(data);
    };

    model.subscribe(subscribe);

    return () => {
      model.unsubscribe(subscribe);
    };
  }, [model]);

  return [issueData, model];
};

const merge = (state: IssueType, event: OptimisticEvent | ConfirmedEvent): IssueType => {
  if (event.name === MergeEvent.UPDATE_ISSUE) {
    return {
      ...state,
      ...event.data,
    };
  }

  if (event.name === MergeEvent.UPDATE_INPUT) {
    return {
      ...state,
      [event.data.name]: event.data.value,
    };
  }

  return state;
};
