import Ably from 'ably/promises';
import Models from '@ably-labs/models';
import pino from 'pino';

const logger = pino();

type Post = {
  id: number;
  text: string;
  comments: string[];
};

type Mutations = {
  updatePost: (text: string) => Promise<{ status: number }>;
  addComment: (text: string) => Promise<{ status: number }>;
};

const ably = new Ably.Realtime.Promise({
  key: process.env.ABLY_API_KEY,
});
const models = new Models({ ably, logLevel: 'silent' });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

(async function main() {
  const model = models.Model<Post, Mutations>('post');

  async function sync() {
    return {
      version: 1,
      data: {
        id: 123,
        text: 'initial state',
        comments: [],
      },
    };
  }

  await model.$register({
    $sync: sync,
    $update: {
      'posts:123': {
        update: async (state, event) => ({
          ...state,
          text: event.data,
        }),
      },
      'posts:123:comments': {
        add: async (state, event) => ({
          ...state,
          comments: state.comments.concat([event.data]),
        }),
      },
    },
    $mutate: {
      updatePost: async () => ({ status: 200 }),
      addComment: async () => ({ status: 200 }),
    },
  });

  model.on((event) => logger.info({ event }, 'model state update'));

  model.subscribe(
    (err, post) => {
      if (err) {
        throw err;
      }
      logger.info({ post }, 'subscribe (non-optimistic)');
    },
    { optimistic: false },
  );

  model.subscribe(
    (err, post) => {
      if (err) {
        throw err;
      }
      logger.info({ post }, 'subscribe (optimistic)');
    },
    { optimistic: true },
  );

  const postText = 'update post';
  const [postResult, postUpdate, postConfirmation] = await model.mutations.updatePost.$expect([
    {
      channel: 'posts:123',
      name: 'update',
      data: postText,
    },
  ])(postText);
  logger.info(postResult, 'mutation: updatePost');
  await postUpdate;
  logger.info('mutation: updatePost: optimistically applied');
  setTimeout(() => ably.channels.get('posts:123').publish('update', postText), 5000);
  logger.info('mutation: updatePost: awaiting confirmation...');
  await postConfirmation;
  logger.info('mutation: updatePost: confirmed');

  const commentText = 'add comment';
  const [commentResult, commentUpdate, commentConfirmation] = await model.mutations.addComment.$expect([
    {
      channel: 'posts:123:comments',
      name: 'add',
      data: commentText,
    },
  ])(commentText);
  logger.info(commentResult, 'mutation: addComment');
  await commentUpdate;
  logger.info('mutation: addComment: optimistically applied');
  setTimeout(
    () =>
      ably.channels.get('posts:123:comments').publish({
        name: 'add',
        data: commentText,
      }),
    5000,
  );
  logger.info('mutation: addComment: awaiting confirmation...');
  await commentConfirmation;
  logger.info('mutation: addComment: confirmed');

  await wait(1000);
  await model.$dispose();
})();
