'use client';

import { useState } from 'react';
import { UserProvider } from '@/context/user';
import Comments from './comments';
import type { PostWithComments } from '@/lib/prisma/api';

export default function Post({ post }: { post: PostWithComments }) {
  const [comments, setComments] = useState(post.comments);

  return (
    <UserProvider>
      <main className="relative flex min-h-screen flex-col items-center justify-center">
        <h1 className="pt-4 pb-8 bg-gradient-to-br from-black via-[#171717] to-[#575757] bg-clip-text text-center text-xl font-medium tracking-tight text-transparent md:text-4xl">
          {post.title}
        </h1>
        <div className="space-y-1 mb-8">
          <p className="font-normal text-gray-500 leading-none">{post.content}</p>
        </div>
        <Comments postId={post.id} comments={comments} onChange={setComments}></Comments>
      </main>
    </UserProvider>
  )
}
