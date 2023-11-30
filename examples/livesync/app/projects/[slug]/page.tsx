import { Issue, Project, Tabs } from '@/components';

import styles from './page.module.css';
import { fetchProjectBySlug } from '@/app/utils';

export default async function ProjectSlug({ params: { slug } }: { params: { slug: string } }) {
  const { name, description, issues } = await fetchProjectBySlug(slug);
  const tabs = [
    {
      tab: 'list',
      content: <Project issues={issues} />,
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
