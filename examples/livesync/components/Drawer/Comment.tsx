import { Owner } from '../Owner';
import { DotIcon } from '../icons';
import { Comment as CommentType, User } from '@/data';

import styles from './Comment.module.css';

export interface CommentData extends CommentType, Pick<User, 'first_name' | 'last_name' | 'id' | 'color'> {}

export const Comment = ({ content, first_name, last_name, color, updated_at }: CommentData) => {
  return (
    <div className={styles.comment}>
      <Owner firstName={first_name} lastName={last_name} color={color} variant="large" />
      <div className={styles.commentHeader}>
        <span className={styles.commentAuthor}>
          {first_name} {last_name}
        </span>
        <DotIcon className={styles.commentDate} />
        <span className={styles.commentDate}>
          {new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
          }).format(new Date(updated_at))}
        </span>
      </div>
      <p className={styles.commentText}>{content}</p>
    </div>
  );
};
