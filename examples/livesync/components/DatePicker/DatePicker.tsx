'use client';

import { ForwardedRef, MouseEventHandler, forwardRef, useState } from 'react';
import ReactDatePicker, { ReactDatePickerProps } from 'react-datepicker';
import { Button } from '@radix-ui/themes';
import { CalendarIcon } from '../icons';

import styles from './DatePicker.module.css';

export const DatePicker = () => {
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  return <ReactDatePicker selected={startDate} onChange={(date) => setStartDate(date)} customInput={<Trigger />} />;
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
