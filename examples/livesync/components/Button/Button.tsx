import cn from 'classnames';

import styles from './Button.module.css';
import { ComponentPropsWithoutRef } from 'react';

type Props<C extends React.ElementType> = ComponentPropsWithoutRef<C> & {
  variant?: 'primary' | 'secondary';
  as?: C;
};

export const Button = <C extends React.ElementType>({ variant = 'primary', as, ...props }: Props<C>) => {
  const Component = as || 'button';

  return (
    <Component
      {...props}
      className={cn(styles.button, {
        [styles.primary]: variant === 'primary',
        [styles.secondary]: variant === 'secondary',
      })}
    />
  );
};
