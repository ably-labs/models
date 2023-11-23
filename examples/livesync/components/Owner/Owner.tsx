import cn from 'classnames';

import styles from './Owner.module.css';

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  firstName: string;
  lastName: string;
  color: string;
  variant?: 'small' | 'regular';
}

export const Owner = ({ firstName, lastName, color, variant = 'regular', ...props }: Props) => {
  return (
    <span className={styles.container} {...props}>
      <span
        style={{ backgroundColor: color }}
        className={cn(styles.avatar, {
          [styles.smallAvatar]: variant === 'small',
        })}
      >
        {firstName[0]}
        {lastName[0]}
      </span>
      <span
        className={cn(styles.label, {
          [styles.smallLabel]: variant === 'small',
        })}
      >
        {firstName} {lastName}
      </span>
    </span>
  );
};
