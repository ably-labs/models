'use client';

import { useEffect, useState } from 'react';
import type { Event } from '@ably-labs/models';
import type { Post as PostType, Author as AuthorType } from '@/lib/prisma/api';
import { AuthorProvider } from '@/context/author';
import { AlertProvider, useAlert } from '@/context/alert';
import Comments from '@/components/comments';
import PostPlaceholder from '@/components/post-placeholder';
import AlertContainer from '@/components/alert';
import { useModel, type ModelType } from '@/lib/models/hook';

// compare optimistic and confirmed comment mutation events by content,
// ignoring other attributes not available on the optimistic event.
function compareComments(optimistic: Event, confirmed: Event) {
  return (
    optimistic.channel === confirmed.channel &&
    optimistic.name === confirmed.name &&
    optimistic.data?.content === confirmed.data?.content
  );
}

function Post({ model }: { model: ModelType }) {
  const { setAlert } = useAlert();
  const [post, setPost] = useState<PostType>(model.confirmed);

  useEffect(() => {
    const onUpdate = (err: Error | null, post?: PostType) => {
      console.log('subscribe: ', err, post);
      if (err) {
        console.error(err);
        return;
      }
      setPost(post!);
    };
    model.subscribe(onUpdate);
    return () => {
      model.unsubscribe(onUpdate);
    };
  });

  async function onAdd(author: AuthorType, postId: number, content: string) {
    const [, update, confirmation] = await model.mutations.addComment.$expect(
      [{ channel: 'comments', name: 'add', data: { author, content } }],
      compareComments,
    )(author, postId, content);
    try {
      setAlert('Adding comment...', 'default');
      await update;
      setAlert('Optimistically added comment', 'info');
      await confirmation;
      setAlert('Add comment confirmed!', 'success');
    } catch (err) {
      setAlert(`Error adding comment: ${err}`, 'error');
    }
  }

  async function onEdit(id: number, content: string) {
    const [, update, confirmation] = await model.mutations.editComment.$expect(
      [{ channel: 'comments', name: 'edit', data: { id, content } }],
      compareComments,
    )(id, content);
    try {
      setAlert('Editing comment', 'default');
      await update;
      setAlert('Optimistically edited comment', 'info');
      await confirmation;
      setAlert('Edit comment confirmed!', 'success');
    } catch (err) {
      setAlert(`Error editing comment: ${err}`, 'error');
    }
  }

  async function onDelete(id: number) {
    const [, update, confirmation] = await model.mutations.deleteComment.$expect(
      [{ channel: 'comments', name: 'delete', data: { id } }],
      compareComments,
    )(id);
    try {
      setAlert('Deleting comment...', 'default');
      await update;
      setAlert('Optimistically deleted comment', 'info');
      await confirmation;
      setAlert('Delete comment confirmed!', 'success');
    } catch (err) {
      setAlert(`Error deleting comment: ${err}`, 'error');
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <h1 className="pt-4 pb-8 bg-gradient-to-br from-black via-[#171717] to-[#575757] bg-clip-text text-center text-xl font-medium tracking-tight text-transparent md:text-4xl">
        {post.title}
      </h1>
      <div className="space-y-1 mb-8">
        <p className="font-normal text-gray-500 leading-none">{post.content}</p>
      </div>
      <Comments
        postId={post.id}
        comments={post.comments}
        onEdit={onEdit}
        onAdd={onAdd}
        onDelete={onDelete}
      ></Comments>
    </main>
  );
}

export default function PostWrapper({ user, post: initialPost }: { user: AuthorType; post: PostType }) {
  const model = useModel(initialPost.id);
  if (!model) {
    return <PostPlaceholder />;
  }
  return (
    <AuthorProvider author={user}>
      <AlertProvider>
        <AlertContainer />
        <Post model={model} />
      </AlertProvider>
    </AuthorProvider>
  );
}
