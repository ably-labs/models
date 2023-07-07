import Ably from 'ably/promises';
import Models from '@ably-labs/models';
import { Model, ModelState, Event } from '@ably-labs/models';
import pino from 'pino';

const logger = pino();

type Post = {
	id: number,
	text: string;
	comments: string[];
}

const ably = new Ably.Realtime({
	key: process.env.ABLY_API_KEY,
});
const models = new Models(ably, { logLevel: 'trace' });

class Example {
	model: Model<Post>;

	constructor() {
		const postStream = models.Stream('post', {
			channel: 'posts:123',
		});
		const commentStream = models.Stream('comment', {
			channel: 'comments',
			filter: 'name == `"add"` && headers.post_id == `123`',
		});

		this.model = models.Model<Post>('post', {
			streams: {
				post: postStream,
				comment: commentStream,
			},
			sync: async () => {
				logger.info('sync');
				return {
					version: 1,
					data: {
						id: 123,
						text: 'initial state',
						comments: [],
					}
				}
			},
		});

		this.model.registerUpdate('post', 'update', async (state: Post, event: Event) => {
			logger.info({ state, event }, 'apply update: updatePost');
			return {
				...state,
				text: event.data,
			};
		});
		this.model.registerUpdate('comment', 'add', async (state: Post, event: Event) => {
			logger.info({ state, event }, 'apply update: addComment');
			return {
				...state,
				comments: state.comments.concat([event.data]),
			};
		});

		this.model.registerMutation('updatePost', {
			mutate: async (...args: any[]) => {
				logger.info({ args }, 'mutation: updatePost');
				await new Promise(resolve => setTimeout(resolve, 1000));
			},
			confirmationTimeout: 5000,
		});
		this.model.registerMutation('addComment', {
			mutate: async (...args: any[]) => {
				logger.info({ args }, 'mutation: addComment');
				await new Promise(resolve => setTimeout(resolve, 1000));
			},
			confirmationTimeout: 5000,
		});

		this.model.on(event => logger.info({ event }, 'model state update'));

		this.model.subscribe((err, post) => {
			if (err) {
				throw err;
			}
			logger.info({ post }, 'subscribe (non-optimistic)');
		}, {
			optimistic: false,
		});
		this.model.subscribe((err, post) => {
			if (err) {
				throw err;
			}
			logger.info({ post }, 'subscribe (optimistic)');
		}, {
			optimistic: true,
		});
	}

	updatePost(text: string) {
		logger.info({ text }, 'updatePost');
		this.model.mutate('updatePost', {
			args: [text],
			events: [{
				stream: 'post',
				name: 'update',
				data: text,
			}],
		});
		return () => {
			logger.info({ text }, 'confirm: updatePost');
			ably.channels.get('posts:123').publish('update', text);
		};
	}

	addComment(text: string) {
		logger.info({ text }, 'addComment');
		this.model.mutate('addComment', {
			args: [text],
			events: [{
				stream: 'comment',
				name: 'add',
				data: text,
			}],
		});
		return () => {
			logger.info({ text }, 'confirm: addComment');
			ably.channels.get('comments').publish({
				name: 'add',
				data: text,
				extras: {
				headers: {
					post_id: 123,
					},
				},
			});
		}
	}
}

function wait(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

(async function () {
	const example = new Example();
	example.model.once(ModelState.READY, async () => {
		example.updatePost('first update')();
		await wait(1000);
		example.updatePost('second update')();
		await wait(1000);
		example.addComment('first comment')();
		await wait(1000);
		example.addComment('second comment')();
	});
})()
