import Ably from 'ably/promises';
import Models from '@ably-labs/models';
import { Model, ModelState, Event } from '@ably-labs/models';

type Post = {
	id: number,
	text: string;
	comments: string[];
}

const ably = new Ably.Realtime({
	key: process.env.ABLY_API_KEY,
});
const models = new Models(ably);

class Example {
	model: Model<Post>;

	constructor() {
		const postStream = models.Stream('post', {
			channel: 'posts:123',
		});
		const commentStream = models.Stream('comment', {
			channel: 'comments',
			filter: "post_id == `123`",
		});

		this.model = models.Model<Post>('post', {
			streams: {
				post: postStream,
				comment: commentStream,
			},
			sync: async () => {
				console.log('sync');
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
			console.log('apply update: updatePost:', state, event);
			return {
				...state,
				text: event.data,
			};
		});
		this.model.registerUpdate('comment', 'add', async (state: Post, event: Event) => {
			console.log('apply update: addComment:', state, event);
			return {
				...state,
				comments: state.comments.concat([event.data]),
			};
		});

		this.model.registerMutation('updatePost', {
			mutate: async (...args: any[]) => {
				console.log('mutation: updatePost:', ...args);
				await new Promise(resolve => setTimeout(resolve, 1000));
			},
			confirmationTimeout: 5000,
		});
		this.model.registerMutation('addComment', {
			mutate: async (...args: any[]) => {
				console.log('mutation: addComment:', ...args);
				await new Promise(resolve => setTimeout(resolve, 1000));
			},
			confirmationTimeout: 5000,
		});

		this.model.on(event => console.log('model state update: ', event));

		this.model.subscribe((err, post) => {
			if (err) {
				throw err;
			}
			console.log('subscribe (non-optimistic):', post);
		}, {
			optimistic: false,
		});
		this.model.subscribe((err, post) => {
			if (err) {
				throw err;
			}
			console.log('subscribe (optimistic):', post);
		}, {
			optimistic: true,
		});
	}

	updatePost(text: string) {
		console.log('updatePost:', text);
		this.model.mutate('updatePost', {
			args: [text],
			events: [{
				stream: 'post',
				name: 'update',
				data: text,
			}],
		});
		return () => {
			console.log('confirm: updatePost:', text);
			ably.channels.get('posts:123').publish('update', text);
		};
	}

	addComment(text: string) {
		console.log('addComment:', text);
		this.model.mutate('addComment', {
			args: [text],
			events: [{
				stream: 'comment',
				name: 'add',
				data: text,
			}],
		});
		return () => {
			console.log('confirm: addComment:', text);
			ably.channels.get('comments').publish({
				name: 'add',
				data: text,
				headers: {
					post_id: 123,
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
