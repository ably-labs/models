'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import cn from 'classnames';
import { Badge, Button, Heading, TextArea } from '@radix-ui/themes';
import { useForm } from 'react-hook-form';
import Skeleton from 'react-loading-skeleton';
// @ts-ignore
import shader from 'shader';
import { StatusTypeValues, User } from '@/data/types';
import { Owner } from '../Owner';
import { Status, StatusType } from '../Status';
import { DatePicker } from '../DatePicker';
import { CloseIcon } from '../icons';
import { Issue } from '../Table';
import { Select, SelectItem } from '../Select';
import { Label } from './Label';
import { Comment, CommentData } from './Comment';
import { fetchDrawerData, fetchIssueById } from './actions';

import styles from './Drawer.module.css';
import { ProjectType } from '..';
interface Props {
  projectId: number;
  children: React.ReactNode;
}

interface FormData {
  comment: string;
}

export const Drawer = ({ children, projectId }: Props) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const issue = searchParams.get('issue');
  const issueId = issue ? parseInt(issue) : null;

  const [issueData, setIssue] = useState<Issue | null>(null);
  const [projects, setProjects] = useState<ProjectType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [comments, setComments] = useState<CommentData[]>([]);

  const {
    register,
    handleSubmit,
    formState: { isValid },
    setValue,
  } = useForm<FormData>();

  const onSubmit = (data: FormData) => {
    // TODO: COL-575 mutation to add comment
    setValue('comment', '');
  };

  const handleCloseDrawer = () => {
    router.push(pathname);
  };

  useEffect(() => {
    const fetchData = async () => {
      const { projects, users } = await fetchDrawerData();
      setProjects(projects);
      setUsers(users);
    };
    fetchData();
  }, []);

  useEffect(() => {
    setIssue(null);
    setComments([]);
    if (!issueId) {
      return;
    }
    const fetchIssue = async (id: number) => {
      const { issue, comments } = await fetchIssueById(id);
      setIssue(issue);
      setComments(comments);
    };
    fetchIssue(issueId);
  }, [issueId]);

  return (
    <>
      {children}
      <aside
        className={cn(styles.container, {
          [styles.isOpen]: searchParams.has('issue'),
        })}
      >
        <Button radius="full" variant="ghost" className={styles.closeButton} onClick={handleCloseDrawer}>
          <CloseIcon />
        </Button>
        <div className={styles.inner}>
          {issueData?.name ? <h3 className={styles.name}>{issueData.name}</h3> : <Skeleton height={58} />}
          <div className={styles.drawerSummary}>
            <Label>Owner</Label>
            {issueData?.owner_id ? (
              <div>
                <Select defaultValue={`${issueData?.owner_id}`}>
                  {users.map(({ id, first_name, last_name, color, slug }) => (
                    <SelectItem key={slug} value={`${id}`}>
                      <Owner variant="small" firstName={first_name} lastName={last_name} color={color} />
                    </SelectItem>
                  ))}
                </Select>
              </div>
            ) : (
              <Skeleton height={32} />
            )}
            <Label>Due date</Label>
            {issueData?.due_date ? (
              <div>
                <DatePicker value={issueData?.due_date.toString()} />
              </div>
            ) : (
              <Skeleton height={32} />
            )}
            <Label>Projects</Label>
            <div>
              <Select defaultValue={`${projectId}`}>
                {projects.map(({ name, color, id, slug }) => (
                  <SelectItem key={slug} value={`${id}`}>
                    <Badge
                      style={{ backgroundColor: color, color: shader(color, -0.6) }}
                      variant="soft"
                      radius="full"
                      highContrast
                      className={styles.badge}
                    >
                      {name}
                    </Badge>
                  </SelectItem>
                ))}
              </Select>
            </div>

            <Label>Status</Label>
            {issueData?.status ? (
              <div>
                <Select defaultValue={issueData?.status}>
                  {StatusTypeValues.map((status) => (
                    <SelectItem key={status} value={status}>
                      <Status status={status as StatusType} />
                    </SelectItem>
                  ))}
                </Select>
              </div>
            ) : (
              <Skeleton height={32} />
            )}
          </div>
          <div>
            <Heading mb="3" size="2" weight="bold" as="h4" className={styles.descriptionTitle}>
              Description
            </Heading>
            {issueData?.description ? (
              <TextArea
                variant="soft"
                placeholder="..."
                rows={10}
                className={styles.description}
                defaultValue={issueData.description}
              />
            ) : (
              <Skeleton height={212} />
            )}
          </div>
        </div>
        <div className={styles.commentsContainer}>
          <div className={styles.commentsListContainer}>
            <Heading mb="4" size="3" weight="medium" as="h4" className={styles.commentsTitle}>
              Comments
            </Heading>
            {comments.map((props) => (
              <Comment key={`comment-${props.id}`} {...props} />
            ))}
          </div>
          <form className={styles.newCommentSection} onSubmit={handleSubmit(onSubmit)}>
            <Owner firstName="Ariana" lastName="Grande" color="#00A5EC" variant="large" />
            <TextArea
              variant="soft"
              placeholder="Add a comment"
              rows={3}
              className={styles.commentTextarea}
              {...register('comment', {
                required: true,
                minLength: { value: 1, message: 'Comment must have something' },
              })}
            />
            {isValid && (
              <Button variant="solid" className={styles.commentButton} type="submit">
                Comment
              </Button>
            )}
          </form>
        </div>
      </aside>
    </>
  );
};
