'use client';

import { Select as RadixSelect } from '@radix-ui/themes';

import styles from './Select.module.css';

interface Props {
  defaultValue: string;
  children: React.ReactNode[];
}

export const Select = ({ defaultValue, children }: Props) => {
  return (
    <RadixSelect.Root defaultValue={defaultValue} size="3">
      <RadixSelect.Trigger variant="ghost" className={styles.trigger} />
      <RadixSelect.Content position="popper" variant="soft" className={styles.optionsList} align="start">
        {children}
      </RadixSelect.Content>
    </RadixSelect.Root>
  );
};
