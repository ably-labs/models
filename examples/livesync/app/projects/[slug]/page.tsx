import { Project, Tabs } from '@/components';

import styles from './page.module.css';
import { fetchProjectBySlug } from '@/app/utils';
import { redirect } from 'next/navigation';

export default async function ProjectSlug({ params: { slug } }: { params: { slug: string } }) {
  const project = await fetchProjectBySlug(slug);
  if (!project) {
    redirect(`/`);
  }

  const { id, name, description, issues } = project;
  const tabs = [
    {
      tab: 'list',
      content: <Project id={id} issues={issues} />,
    },
    { tab: 'board', content: 'Coming soon!' },
    { tab: 'timeline', content: 'Coming soon!' },
  ];

  return (
    <div className={styles.main}>
      <div>
        <h1 className={styles.title}>{name}</h1>
        <p className={styles.subtitle}>{description}</p>
      </div>
      <Tabs tabs={tabs} />
    </div>
  );
}
