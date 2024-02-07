'use client';

import { useEffect, useState } from 'react';
import { Select as RadixSelect } from '@radix-ui/themes';

import styles from './Select.module.css';

interface Props {
  defaultValue: string;
  children: React.ReactNode[];
  name: string;
  onChange: (data: { [key: string]: string }) => void;
}

export const Select = ({ defaultValue, children, name, onChange }: Props) => {
  const [value, setValue] = useState(defaultValue);
  const handleChange = (value: string) => {
    setValue(value);
    onChange({ [name]: value });
  };

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <RadixSelect.Root size="3" name={name} value={value} onValueChange={handleChange}>
      <RadixSelect.Trigger variant="ghost" className={styles.trigger} />
      <RadixSelect.Content position="popper" variant="soft" className={styles.optionsList} align="start">
        {children}
      </RadixSelect.Content>
    </RadixSelect.Root>
  );
};
