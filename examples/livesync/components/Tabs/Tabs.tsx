'use client';

import { ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';

import styles from './Tabs.module.css';

interface Props {
  tabs: { tab: string; content: ReactNode }[];
}

export const Tabs = ({ tabs }: Props) => {
  return (
    <RadixTabs.Root defaultValue={tabs[0].tab} className="">
      <RadixTabs.List className={styles.list}>
        {tabs.map(({ tab }) => (
          <RadixTabs.Trigger key={`${tab}-trigger`} value={tab} className={styles.trigger}>
            {tab}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map(({ tab, content }) => (
        <RadixTabs.Content key={`${tab}-content`} value={tab}>
          {content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
};
