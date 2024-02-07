import { useEffect } from 'react';

export const useInputHeight = (field: HTMLTextAreaElement | null, value?: string | number | readonly string[]) => {
  useEffect(() => {
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = field.scrollHeight + 'px';
  }, [value, field]);
};
