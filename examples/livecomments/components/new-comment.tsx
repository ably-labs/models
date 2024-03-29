'use client';

import Image from 'next/image';
import { useState, useContext, FormEvent } from 'react';

import { AuthorContext } from '@/context/author';
import { DEFAULT_AVATAR_URL } from '@/lib/image';
import { Author as AuthorType } from '@/lib/prisma/api';

export default function NewComment({ onAdd }: { onAdd: (author: AuthorType, content: string) => void }) {
  const author = useContext(AuthorContext);
  const [comment, setComment] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!author) {
      throw new Error('user is not set');
    }
    onAdd(author, comment);
    setComment('');
  }

  return (
    <form
      className="max-w-xl mx-auto w-full"
      onSubmit={onSubmit}
    >
      <div className="w-full shadow-xl rounded-lg bg-gray-50">
        <div className="px-4 py-2 bg-white rounded-t-lg">
          <div className="flex items-center py-3">
            <div className="flex flex-col space-x-4 pr-3">
              <Image
                src={author?.image || DEFAULT_AVATAR_URL}
                alt={author?.username || 'avatar'}
                width={36}
                height={36}
                className="rounded-full ring-1 ring-gray-900/5"
              />
            </div>
            <p className="text-sm font-semibold">{author?.username}</p>
          </div>
          <label
            htmlFor="comment"
            className="sr-only"
          >
            Your comment
          </label>
          <textarea
            id="comment"
            rows={4}
            className="w-full px-0 text-sm text-gray-900 bg-white outline-none focus:outline-none border-0 border-transparent focus:border-transparent focus:ring-0"
            placeholder="Write a comment..."
            required
            onChange={(e) => setComment(e.target.value)}
            value={comment}
          ></textarea>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t">
          <button
            type="submit"
            className="inline-flex items-center py-2.5 px-4 text-xs font-medium text-center text-white bg-blue-700 rounded-lg focus:bg-blue-900 hover:bg-blue-800"
          >
            Post comment
          </button>
        </div>
      </div>
    </form>
  );
}
