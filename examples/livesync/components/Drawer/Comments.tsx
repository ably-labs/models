import { useEffect, useState } from 'react';
import { Button, Heading, TextArea } from '@radix-ui/themes';
import { useForm } from 'react-hook-form';

import { User } from '@/data/types';

import { Comment, CommentData } from './Comment';
import { fetchComments, postComment } from './actions';
import { Owner } from '../Owner';

import styles from './Comments.module.css';

interface Props {
  issueId: number | null;
  user?: User;
}

interface FormData {
  content: string;
}

export const Comments = ({ issueId, user }: Props) => {
  const [comments, setComments] = useState<CommentData[] | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isValid },
    setValue,
  } = useForm<FormData>();

  const onSubmit = async ({ content }: FormData) => {
    if (issueId === null || !user) return;

    const newComment = await postComment({ userId: user.id, issueId, content });
    setComments((prev) => [
      {
        ...newComment,
        ...user,
      },
      ...(prev || []),
    ]);
    setValue('content', '');
  };

  useEffect(() => {
    setComments([]);
    if (!issueId) return;

    const fetchIssue = async (id: number) => {
      const comments = await fetchComments(id);
      setComments(comments);
    };
    fetchIssue(issueId);
  }, [issueId]);

  return (
    <div className={styles.commentsContainer}>
      <div className={styles.commentsListContainer}>
        <Heading mb="4" size="3" weight="medium" as="h4" className={styles.commentsTitle}>
          Comments
        </Heading>
        {comments?.map((props) => <Comment key={`comment-${props.id}`} {...props} />)}
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
