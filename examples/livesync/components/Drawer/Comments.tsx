import { Button, Heading, TextArea } from '@radix-ui/themes';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';

import { User } from '@/data/types';

import { Comment, CommentData } from './Comment';
import { postComment } from './actions';
import { Owner } from '../Owner';

import styles from './Comments.module.css';
import { CommentsMergeEvent, useCommentsModel } from '../modelsClient';

interface Props {
  issueId: number | null;
  user?: User;
}

interface FormData {
  content: string;
}

export const Comments = ({ issueId, user }: Props) => {
  const [comments, model] = useCommentsModel(issueId);
  const {
    register,
    handleSubmit,
    formState: { isValid },
    setValue,
  } = useForm<FormData>();

  const onSubmit = async ({ content }: FormData) => {
    if (issueId === null || !user || !model) return;

    const mutationID = uuidv4();
    const data = {
      userId: user.id,
      issueId,
      content,
      mutationID,
      first_name: user.first_name,
      last_name: user.last_name,
      color: user.color,
      updated_at: new Date().toISOString(),
    };

    const [confirmation, cancel] = await model.optimistic({
      mutationID,
      name: CommentsMergeEvent.POST_COMMENT,
      data,
    });
    setValue('content', '');

    try {
      await postComment(data);
      await confirmation;
    } catch (err) {
      console.error(err);
      cancel();
    }
  };

  return (
    <div className={styles.commentsContainer}>
      <div className={styles.commentsListContainer}>
        <Heading mb="4" size="3" weight="medium" as="h4" className={styles.commentsTitle}>
          Comments
        </Heading>
        {comments?.map((props: CommentData) => <Comment key={`comment-${props.id}`} {...props} />)}
      </div>
      <form className={styles.newCommentSection} onSubmit={handleSubmit(onSubmit)}>
        <Owner firstName={user?.first_name} lastName={user?.last_name} color={user?.color} variant="large" />
        <TextArea
          variant="soft"
          placeholder="Add a comment"
          rows={3}
          className={styles.commentTextarea}
          {...register('content', {
            required: true,
            minLength: { value: 1, message: 'Comment must have something' },
          })}
        />
        {isValid && user && (
          <Button variant="solid" className={styles.commentButton} type="submit">
            Comment
          </Button>
        )}
      </form>
    </div>
  );
};
