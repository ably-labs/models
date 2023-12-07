'use client';

import { Select as RadixSelect } from '@radix-ui/themes';

import styles from './Select.module.css';

interface Props {
  defaultValue: string;
  children: React.ReactNode[];
  name: string;
  onChange: (data: { [key: string]: string }) => void;
}

export const Select = ({ defaultValue, children, name, onChange }: Props) => {
  const handleChange = (value: string) => {
    onChange({ [name]: value });
  };
  return (
    <RadixSelect.Root defaultValue={defaultValue} size="3" name={name} onValueChange={handleChange}>
      <RadixSelect.Trigger variant="ghost" className={styles.trigger} />
      <RadixSelect.Content position="popper" variant="soft" className={styles.optionsList} align="start">
        {children}
      </RadixSelect.Content>
    </RadixSelect.Root>
  );
};
