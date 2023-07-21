import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import Table from '@/components/table'
import TablePlaceholder from '@/components/table-placeholder'

// Prisma does not support Edge without the Data Proxy currently
// export const runtime = 'edge'
export const preferredRegion = 'home'
export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center">
      <h1 className="pt-4 pb-8 bg-gradient-to-br from-black via-[#171717] to-[#575757] bg-clip-text text-center text-4xl font-medium tracking-tight text-transparent md:text-7xl">
        Ably Models SDK Demo
      </h1>
      <Suspense fallback={<TablePlaceholder />}>
        <Table />
      </Suspense>
      <p className="font-light text-gray-600 w-full max-w-lg text-center mt-6">
        <Link
          href="https://github.com/ably-labs/models"
          className="font-medium underline underline-offset-4 hover:text-black transition-colors"
        >
          Ably Models SDK
        </Link>{' '}
        demo with{' '}
        <Link
          href="https://vercel.com/postgres"
          className="font-medium underline underline-offset-4 hover:text-black transition-colors"
        >
          Vercel Postgres
        </Link>{' '}
        and{' '}
        <Link
          href="https://prisma.io"
          className="font-medium underline underline-offset-4 hover:text-black transition-colors"
        >
          Prisma
        </Link>
        .
      </p>

      <div className="sm:absolute sm:bottom-0 w-full px-20 py-10 flex justify-between">
        <Link href="http://ably.com/">
          <Image
            src="/ably-logo-col-horiz-rgb.svg"
            alt="Ably Logo"
            width={100}
            height={32}
            priority
          />
        </Link>
        <Link
          href="https://github.com/ably-labs/models/tree/main/examples/posts"
          className="flex items-center space-x-2"
        >
          <Image
            src="/github.svg"
            alt="GitHub Logo"
            width={24}
            height={24}
            priority
          />
          <p className="font-light">Source</p>
        </Link>
      </div>
    </main>
  )
}
