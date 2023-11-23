import { HTMLAttributes } from 'react';
import cn from 'classnames';

import styles from './Label.module.css';

export const Label = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn(styles.label, className)} {...props} />;
};
