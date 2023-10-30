import ModelsClient, {Event, ConfirmedEvent, OptimisticEvent} from '@ably-labs/models';
import Ably from 'ably/promises';
import pino from 'pino';
import {v4 as uuidv4} from 'uuid';

const logger = pino();

type Post = {
  id: number;
  text: string;
  comments: string[];
};

const ably = new Ably.Realtime.Promise({
  key: process.env.ABLY_API_KEY,
});

const modelsClient = new ModelsClient({ably, logLevel: 'silent', optimisticEventOptions: {timeout: 5000}});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

(async function main() {
  const channelName = 'models:post:' + uuidv4();

  async function sync() {
    const data: Post = {
      id: 123,
      text: 'initial state',
      comments: [],
    };
    const sequenceID = '10000';
    return {data, sequenceID};
  }

  let sequentialID = 1;

  async function simulateConfirmation(event: Event) {
    setTimeout(async () => {
      const message = {
        id: '' + sequentialID++,
        name: event.name,
        data: event.data,
        extras: {
          headers: {
            'x-ably-models-event-uuid': event.mutationID,
          },
        },
      };
      await ably.channels.get(channelName).publish(message);
      logger.debug({message}, 'simulated confirmation');
    }, 3000);
  }

  async function merge(state: Post, event: OptimisticEvent | ConfirmedEvent) {
    logger.info({event}, 'merging event');

    switch (event.name) {
      case 'updatePost':
        return {
          ...state,
          text: event.data,
        };
      case 'addComment':
        return {
          ...state,
          comments: state.comments.concat([event.data]),
        };
    }
  }

  const model = await modelsClient.models.get<Post>({name: 'post', channelName: channelName, sync: sync, merge: merge});
  logger.info('started the model');

  model.on((event) => logger.info({event}, 'model state update'));

  model.subscribe(
    (err, post) => {
      if (err) {
        throw err;
      }
      logger.info({post}, 'subscribe (non-optimistic)');
    },
    {optimistic: false},
  );

  model.subscribe(
    (err, post) => {
      if (err) {
        throw err;
      }
      logger.info({post}, 'subscribe (optimistic)');
    },
    {optimistic: true},
  );

  const event1: Event = {
    mutationID: uuidv4(),
    name: 'updatePost',
    data: 'my updated post',
  };

  const [confirmedUpdate] = await model.optimistic(event1);
  logger.info('mutation: updatePost');
  logger.info('mutation: updatePost: awaiting confirmation...');
  simulateConfirmation(event1);

  await confirmedUpdate;
  logger.info('mutation: updatePost: confirmed');

  const event2 = {
    mutationID: uuidv4(),
    name: 'addComment',
    data: 'my new comment',
  };
  const [confirmedAdd] = await model.optimistic(event2);
  logger.info('mutation: addComment');
  logger.info('mutation: addComment: awaiting confirmation...');
  simulateConfirmation(event2);

  await confirmedAdd;
  logger.info('mutation: addComment: confirmed');

  await wait(1000);
  await model.dispose();
  ably.close();
  logger.info('goodbye');
})();
