import { useCallback, useEffect } from 'react';

export const useInputHeight = (name: string, value: string | undefined) => {
  const setInputHeight = useCallback(() => {
    const textarea: HTMLTextAreaElement | null = document.querySelector(name);
    if (!textarea) return;
    textarea.style.height = textarea.scrollHeight + 'px';
  }, [name]);

  useEffect(() => {
    setInputHeight();
  }, [value, setInputHeight]);

  return setInputHeight;
};
