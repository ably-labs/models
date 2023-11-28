import { Owner } from '../Owner';
import { DotIcon } from '../icons';

import styles from './Comment.module.css';

export const Comment = ({ content }: { content: string }) => {
  return (
    <div className={styles.comment}>
      <Owner firstName="Xander" lastName="Cage" color="#bada55" variant="large" />
      <div className={styles.commentHeader}>
        {/* TODO: Adapt names and date fields when the data comes  */}
        <span className={styles.commentAuthor}>Xander Cage</span>
        <DotIcon className={styles.commentDate} />
        <span className={styles.commentDate}>2 days ago</span>
      </div>
      <p className={styles.commentText}>{content}</p>
    </div>
  );
};
