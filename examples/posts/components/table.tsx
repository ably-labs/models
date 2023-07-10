import Image from 'next/image'
import Link from 'next/link'
import RefreshButton from './refresh-button'
import { getPosts } from '@/lib/prisma/api';

export default async function Table() {
  const startTime = Date.now()
  const posts = await getPosts();
  const duration = Date.now() - startTime
  await new Promise(resolve => setTimeout(resolve, 10000));

  return (
    <div className="bg-white/30 p-12 shadow-xl ring-1 ring-gray-900/5 rounded-lg backdrop-blur-lg max-w-xl mx-auto w-full">
      <div className="flex justify-between items-center mb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Recent Posts</h2>
          <p className="text-sm text-gray-500">
            Fetched {posts.length} posts in {duration}ms
          </p>
        </div>
        <RefreshButton />
      </div>
      <div className="divide-y divide-gray-900/5">
        {posts.map((post) => (
          <Link
            key={post.title}
            href={`/post/${post.id}`}
            className="font-medium underline underline-offset-4 hover:text-black transition-colors"
          >
            <div
              className="flex items-center justify-between py-3"
            >
              <div className="flex items-center space-x-4">
                <Image
                  src="https://picsum.photos/100"
                  alt={post.title}
                  width={48}
                  height={48}
                  className="rounded-full ring-1 ring-gray-900/5"
                />
                <div className="space-y-1">
                  <p className="font-medium leading-none">{post.title}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
