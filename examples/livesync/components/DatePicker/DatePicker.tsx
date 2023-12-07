'use client';

import { ForwardedRef, MouseEventHandler, forwardRef, useState } from 'react';
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
  const [startDate, setStartDate] = useState<Date | null>(new Date(value));
  const handleChange = (date: Date | null) => {
    setStartDate(date);
    onChange({ [name]: date });
  };
  return <ReactDatePicker name={name} selected={startDate} onChange={handleChange} customInput={<Trigger />} />;
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
