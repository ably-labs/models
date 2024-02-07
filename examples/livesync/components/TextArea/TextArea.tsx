'use client';

import { ChangeEvent, ComponentProps, useEffect, useRef, useState } from 'react';
import * as Radix from '@radix-ui/themes';
import { useInputHeight } from './useInputHeight';

export const TextArea = ({ defaultValue, onChange, name, ...props }: ComponentProps<typeof Radix.TextArea>) => {
  const [value, setValue] = useState(defaultValue);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useInputHeight(textAreaRef.current, value);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement> | undefined) => {
    if (event) {
      setValue(event.target.value);
      if (!onChange) return;
      onChange(event);
    }
  };

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return <Radix.TextArea ref={textAreaRef} value={value} onChange={handleChange} name={name} {...props} />;
};
