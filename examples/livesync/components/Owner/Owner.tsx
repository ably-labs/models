import cn from 'classnames';

import styles from './Owner.module.css';
import Skeleton from 'react-loading-skeleton';

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  firstName?: string;
  lastName?: string;
  color?: string;
  variant?: 'small' | 'regular' | 'large';
}

export const Owner = ({ firstName, lastName, color, variant = 'regular', ...props }: Props) => {
  return (
    <span className={styles.container} {...props}>
      {firstName && lastName ? (
        <span
          style={{ backgroundColor: color }}
          className={cn(styles.avatar, {
            [styles.smallAvatar]: variant === 'small',
            [styles.largeAvatar]: variant === 'large',
          })}
        >
          {firstName[0]}
          {lastName[0]}
        </span>
      ) : (
        <Skeleton
          className={cn(styles.avatar, {
            [styles.smallAvatar]: variant === 'small',
            [styles.largeAvatar]: variant === 'large',
          })}
        />
      )}
      {variant !== 'large' && (
        <span
          className={cn(styles.label, {
            [styles.smallLabel]: variant === 'small',
          })}
        >
          {firstName} {lastName}
        </span>
      )}
    </span>
  );
};
