'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import cn from 'classnames';
import { Badge, Button, Heading, TextArea } from '@radix-ui/themes';
import Skeleton from 'react-loading-skeleton';
import cookies from 'js-cookie';
import sample from 'lodash.sample';
import debounce from 'lodash.debounce';
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
import { FieldWithLoader } from './FieldWithLoader';
import { Comments } from './Comments';
import { UpdateIssueData, fetchDrawerData, fetchIssueById, updateInput, updateIssue } from './actions';

import styles from './Drawer.module.css';
import { ProjectType } from '..';
import { useInputHeight } from './useInputHeight';

interface Props {
  projectId: number;
  children: React.ReactNode;
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
  const [currentUser, setCurrentUser] = useState<User | undefined>();

  const setNameInputHeight = useInputHeight('textarea[name="name"]', issueData?.name);

  const handleCloseDrawer = () => {
    router.push(pathname);
  };

  const debouncedUpdateInput = debounce(async (id: number, name: string, value: string) => {
    const issue = await updateInput(id, name, value);
    setIssue(issue);
  }, 500);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNameInputHeight();

    if (!issueId) return;
    debouncedUpdateInput(issueId, e.target.name, e.target.value);
  };

  const handleIssueUpdate = async ({
    project_id,
    owner_id,
    status,
    due_date,
  }: {
    project_id?: string;
    owner_id?: string;
    status?: StatusType;
    due_date?: string | null;
  }) => {
    if (!issueId || !issueData) return;

    const newData: UpdateIssueData = {
      project_id: project_id ? parseInt(project_id) : projectId,
      owner_id: owner_id ? parseInt(owner_id) : issueData.owner_id,
      status: status ?? issueData.status,
      due_date: due_date ?? issueData.due_date,
    };

    const updatedIssueData = await updateIssue(issueId, newData);
    setIssue(updatedIssueData);
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
    if (!issueId) return;

    const fetchIssue = async (id: number) => {
      const issue = await fetchIssueById(id);
      setIssue(issue);
    };
    fetchIssue(issueId);
  }, [issueId]);

  useEffect(() => {
    if (!users) return;
    const user = cookies.get('livesync_user');

    if (user) {
      setCurrentUser(JSON.parse(user));
      return;
    }
    const newUser = sample(users);
    cookies.set('livesync_user', JSON.stringify(newUser));
    setCurrentUser(newUser);
  }, [users]);

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
          {issueData?.name ? (
            <TextArea
              className={styles.name}
              rows={1}
              defaultValue={issueData.name}
              name="name"
              onChange={handleInputChange}
            />
          ) : (
            <Skeleton height={58} />
          )}
          <div className={styles.drawerSummary}>
            <Label>Owner</Label>
            <FieldWithLoader isLoading={!issueData?.owner_id || users.length === 0}>
              <Select defaultValue={`${issueData?.owner_id}`} name="owner_id" onChange={handleIssueUpdate}>
                {users.map(({ id, first_name, last_name, color, slug }) => (
                  <SelectItem key={slug} value={`${id}`}>
                    <Owner variant="small" firstName={first_name} lastName={last_name} color={color} />
                  </SelectItem>
                ))}
              </Select>
            </FieldWithLoader>

            <Label>Due date</Label>
            <FieldWithLoader isLoading={!issueData?.due_date}>
              <DatePicker value={issueData?.due_date.toString() || ''} name="due_date" onChange={handleIssueUpdate} />
            </FieldWithLoader>

            <Label>Projects</Label>
            <FieldWithLoader isLoading={projects.length === 0}>
              <Select defaultValue={`${projectId}`} name="project_id" onChange={handleIssueUpdate}>
                {projects.map(({ name, color, id, slug }) => (
                  <SelectItem key={`${id}-${slug}`} value={`${id}`}>
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
            </FieldWithLoader>

            <Label>Status</Label>
            <FieldWithLoader isLoading={!issueData?.status}>
              <Select defaultValue={issueData?.status || ''} name="status" onChange={handleIssueUpdate}>
                {StatusTypeValues.map((status) => (
                  <SelectItem key={status} value={status}>
                    <Status status={status as StatusType} />
                  </SelectItem>
                ))}
              </Select>
            </FieldWithLoader>
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
                name="description"
                className={styles.description}
                defaultValue={issueData.description}
                onChange={handleInputChange}
              />
            ) : (
              <Skeleton height={212} />
            )}
          </div>
        </div>
        <Comments issueId={issueId} user={currentUser} />
      </aside>
    </>
  );
};
