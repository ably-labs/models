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

console.log(process.env.ABLY_API_KEY);
const ably = new Ably.Realtime.Promise({
	key: process.env.ABLY_API_KEY,
});
const models = new Models({ ably, logLevel: 'silent' });

class Example {
	model: Model<Post>;

	constructor() {
		this.model = models.Model<Post>('post', {
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

		this.model.$register({
			$update: {
				'posts:123': {
					update: async (state: Post, event: Event) => {
						logger.info({ state, event }, 'apply update: updatePost');
						return {
							...state,
							text: event.data,
						};
					},
				},
				'posts:123:comments': {
					add: async (state: Post, event: Event) => {
						logger.info({ state, event }, 'apply update: addComment');
						return {
							...state,
							comments: state.comments.concat([event.data]),
						};
					}
				}
			},
			$mutate: {
				updatePost: {
					mutate: async (...args: any[]) => {
						logger.info({ args }, 'mutation: updatePost');
						await new Promise(resolve => setTimeout(resolve, 1000));
					},
					confirmationTimeout: 5000,
				},
				addComment: {
					mutate: async (...args: any[]) => {
						logger.info({ args }, 'mutation: addComment');
						await new Promise(resolve => setTimeout(resolve, 1000));
					},
					confirmationTimeout: 5000,
				},
			}
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
				channel: 'posts:123',
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
				channel: 'posts:123:comments',
				name: 'add',
				data: text,
			}],
		});
		return () => {
			logger.info({ text }, 'confirm: addComment');
			ably.channels.get('posts:123:comments').publish({
				name: 'add',
				data: text,
			});
		}
	}

	async teardown() {
		this.model.dispose();
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
		await wait(1000);
		await example.teardown();
		logger.info('goodbye');
	});
})()
