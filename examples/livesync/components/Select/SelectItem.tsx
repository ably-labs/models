'use client';

import { Select as RadixSelect } from '@radix-ui/themes';

import styles from './Select.module.css';

interface Props {
  children: React.ReactNode;
  value: string;
}

export const SelectItem = ({ children, value }: Props) => {
  return (
    <RadixSelect.Item value={value} className={styles.selectItem}>
      {children}
    </RadixSelect.Item>
  );
};
