import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { Theme } from '@radix-ui/themes';
import cn from 'classnames';
import { Header, PoweredByAbly, MenuItems } from '@/components';
import { DashboardIcon, ProjectsIcon, ReportingIcon, TeamMembersIcon } from '@/components/icons';
import { fetchProjects } from './utils';

import './global.css';
import styles from './layout.module.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const nextBook = localFont({
  variable: '--font-next-book',
  src: [
    {
      path: '../fonts/NEXT-Book-Light-Italic.woff2',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../fonts/NEXT-Book-Light.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../fonts/NEXT-Book-Medium-Italic.woff2',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../fonts/NEXT-Book-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
});

export const metadata: Metadata = {
  title: 'LiveSync Demo',
  description: 'Demo of LiveSync with Next.js',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const links = await fetchProjects();
  const menuItems = [
    {
      title: 'Projects',
      to: '/projects',
      Icon: <ProjectsIcon />,
      value: 'projects',
      links,
    },
    ...items,
  ];

  return (
    <html lang="en">
      <body className={cn(styles.body, inter.variable, nextBook.variable)}>
        <Theme radius="large" appearance="light">
          <div className={styles.page}>
            <div className={styles.sidebar}>
              <MenuItems items={menuItems} />
              <PoweredByAbly />
            </div>
            <main className={styles.content}>{children}</main>
            <Header className={styles.header}>
              <MenuItems items={items} />
            </Header>
          </div>
        </Theme>
      </body>
    </html>
  );
}

const items = [
  {
    title: 'Reporting',
    to: '/reporting',
    Icon: <ReportingIcon />,
    value: 'reporting',
    isComingSoon: true,
  },
  {
    title: 'Dashboard',
    to: '/dashboard',
    Icon: <DashboardIcon />,
    value: 'dashboard',
  },
  {
    title: 'Team Members',
    to: '/team',
    Icon: <TeamMembersIcon />,
    value: 'team',
  },
];
