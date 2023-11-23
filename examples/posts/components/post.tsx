'use client';

import { useEffect, useState } from 'react';
import type { Post as PostType, Author as AuthorType } from '@/lib/prisma/api';
import { AuthorProvider } from '@/context/author';
import { AlertProvider, useAlert } from '@/context/alert';
import Comments from '@/components/comments';
import PostPlaceholder from '@/components/post-placeholder';
import AlertContainer from '@/components/alert';
import { useModel, ModelType } from '@/lib/models/hook';
import { addComment, deleteComment, editComment } from '@/lib/models/mutations';
import { v4 as uuidv4 } from 'uuid';

function Post({ model }: { model: ModelType }) {
  const { setAlert } = useAlert();
  const [post, setPost] = useState<PostType>(model.data.confirmed);

  useEffect(() => {
    const onUpdate = (err: Error | null, post?: PostType) => {
      if (err) {
        console.error(err);
        return;
      }
      setPost(post!);
    };

    if (model.state !== 'disposed') {
      // The model can get disposed based on the order that the hooks are processed on hot-reload
      // which would cause an error that we're subscribing to a disposed model.
      model.subscribe(onUpdate);
    }

    return () => {
      model.unsubscribe(onUpdate);
    };
  }, []);

  async function onAdd(author: AuthorType, postId: number, content: string) {
    const mutationID = uuidv4();
    const [confirmed, cancel] = await model.optimistic({
      mutationID: mutationID,
      name: 'addComment',
      data: { id: uuidv4(), postId, author, content, optimistic: true, createdAt: Date.now() },
    });
    setAlert('Optimistically added comment', 'info');

    try {
      await addComment(mutationID, author, postId, content);
      await confirmed;
      setAlert('Add comment confirmed!', 'success');
    } catch (err) {
      setAlert(`Error adding comment: ${err}`, 'error');
      cancel();
    }
  }

  async function onEdit(commentId: number, content: string) {
    const mutationID = uuidv4();
    const editedComment = { ...post.comments.findLast((c) => c.id === commentId)!, content: content, optimistic: true };
    const [confirmed, cancel] = await model.optimistic({
      mutationID: mutationID,
      name: 'editComment',
      data: editedComment,
    });
    setAlert('Optimistically edited comment', 'info');

    try {
      await editComment(mutationID, commentId, content);
      await confirmed;
      setAlert('Edit comment confirmed!', 'success');
    } catch (err) {
      setAlert(`Error editing comment: ${err}`, 'error');
      cancel();
    }
  }

  async function onDelete(commentId: number) {
    const mutationID = uuidv4();
    const [confirmed, cancel] = await model.optimistic({
      mutationID: mutationID,
      name: 'deleteComment',
      data: { id: commentId },
    });
    setAlert('Optimistically deleted comment', 'info');

    try {
      await deleteComment(mutationID, commentId);
      await confirmed;
      setAlert('Delete comment confirmed!', 'success');
    } catch (err) {
      setAlert(`Error deleting comment: ${err}`, 'error');
      cancel();
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
