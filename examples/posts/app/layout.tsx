import './globals.css'
import { Inter } from 'next/font/google'

export const metadata = {
  title: 'Ably Models Demo with Vercel Postgres & Prisma',
  description:
    'A simple Next.js app showcasing the Ably Models SDK with Vercel Postgres as the database and Prisma as the ORM',
}

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  )
}
