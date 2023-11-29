import { Projects, Tabs } from '@/components';

import styles from './page.module.css';

export default function ProjectSlug() {
  const tabs = [
    {
      tab: 'list',
      content: <Projects />,
    },
    { tab: 'board', content: 'Coming soon!' },
    { tab: 'timeline', content: 'Coming soon!' },
  ];

  return (
    <div className={styles.main}>
      <div>
        <h1 className={styles.title}>Project Marketing Issues</h1>
        <p className={styles.subtitle}>View your team’s project issues.</p>
      </div>
      <Tabs tabs={tabs} />
    </div>
  );
}
