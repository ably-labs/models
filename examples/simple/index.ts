import Models, { type MutationContext } from '@ably-labs/models';
import Ably from 'ably/promises';
import pino from 'pino';

const logger = pino();

type Post = {
  id: number;
  text: string;
  comments: string[];
};

type Mutations = {
  updatePost: (context: MutationContext, text: string) => Promise<{ status: number }>;
  addComment: (context: MutationContext, text: string) => Promise<{ status: number }>;
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
      id: 123,
      text: 'initial state',
      comments: [],
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
      updatePost: async (context: MutationContext) => {
        // simulate confirmation
        setTimeout(async () => {
          for (const event of context.events) {
            await ably.channels.get('posts:123').publish({
              name: 'update',
              data: postText,
              extras: {
                headers: {
                  'x-ably-models-event-uuid': event.uuid,
                },
              },
            });
          }
        }, 5000);
        return { status: 200 };
      },
      addComment: async (context: MutationContext) => {
        // simulate confirmation
        setTimeout(async () => {
          for (const event of context.events) {
            await ably.channels.get('posts:123:comments').publish({
              name: 'add',
              data: commentText,
              extras: {
                headers: {
                  'x-ably-models-event-uuid': event.uuid,
                },
              },
            });
          }
        }, 5000);
        return { status: 200 };
      },
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
  const [postResult, postConfirmation] = await model.mutations.updatePost.$expect({
    events: [
      {
        channel: 'posts:123',
        name: 'update',
        data: postText,
      },
    ],
  })(postText);
  logger.info(postResult, 'mutation: updatePost');

  logger.info('mutation: updatePost: awaiting confirmation...');
  await postConfirmation;
  logger.info('mutation: updatePost: confirmed');

  const commentText = 'add comment';
  const [commentResult, commentConfirmation] = await model.mutations.addComment.$expect({
    events: [
      {
        channel: 'posts:123:comments',
        name: 'add',
        data: commentText,
      },
    ],
  })(commentText);
  logger.info(commentResult, 'mutation: addComment');

  logger.info('mutation: addComment: awaiting confirmation...');
  await commentConfirmation;
  logger.info('mutation: addComment: confirmed');

  await wait(1000);
  await model.$dispose();
})();
