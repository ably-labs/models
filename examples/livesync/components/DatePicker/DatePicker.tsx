'use client';

import { ForwardedRef, MouseEventHandler, forwardRef, useEffect, useState } from 'react';
import ReactDatePicker, { ReactDatePickerProps } from 'react-datepicker';
import { Button } from '@radix-ui/themes';
import { CalendarIcon } from '../icons';

import styles from './DatePicker.module.css';

interface Props {
  value: string;
  name: string;
  onChange: (data: { [k: string]: Date | null }) => void;
}

export const DatePicker = ({ value, name, onChange }: Props) => {
  const [date, setDate] = useState<Date | null>(new Date(value));
  const handleChange = (date: Date | null) => {
    setDate(date);
    onChange({ [name]: date });
  };

  useEffect(() => {
    if (value) setDate(new Date(value));
  }, [value]);

  return <ReactDatePicker name={name} selected={date} onChange={handleChange} customInput={<Trigger />} />;
};

const Trigger = forwardRef(
  (
    {
      value,
      onClick,
    }: { value?: ReactDatePickerProps['value']; onClick?: MouseEventHandler<HTMLButtonElement> | undefined },
    ref: ForwardedRef<HTMLButtonElement>,
  ) => (
    <Button variant="soft" onClick={onClick} ref={ref} className={styles.trigger}>
      <span className={styles.icon}>
        <CalendarIcon />
      </span>
      {value &&
        new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
        }).format(new Date(value))}
    </Button>
  ),
);

Trigger.displayName = 'Trigger';
