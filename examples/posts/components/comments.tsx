'use client';

import { Suspense } from 'react';
import { User } from '@prisma/client';
import NewComment from '@/components/new-comment';
import Comment from '@/components/comment';
import CommentPlaceholder from '@/components/comment-placeholder';
import type { Comment as CommentType } from '@/lib/prisma/api';

type CommentsProps = {
  postId: number;
  comments: CommentType[];
  onAdd: (author: User, postId: number, content: string) => void;
  onEdit: (id: number, content: string) => void;
  onDelete: (id: number) => void;
};

export default function Comments({ postId, comments, onAdd, onEdit, onDelete }: CommentsProps) {
  return (
    <>
      <div className="divide-y divide-gray-900/5">
        {/* TODO: comment.id is undefined when optimistic */}
        {comments.map((comment) => (
          <Suspense
            key={comment.id}
            fallback={<CommentPlaceholder />}
          >
            <Comment
              comment={comment}
              onEdit={(content) => onEdit(comment.id, content)}
              onDelete={() => onDelete(comment.id)}
            />
          </Suspense>
        ))}
      </div>
      <NewComment onAdd={(author, content) => onAdd(author, postId, content)} />
    </>
  );
}
