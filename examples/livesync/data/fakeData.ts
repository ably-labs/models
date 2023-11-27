import { faker } from '@faker-js/faker';
import { Issue, Project, StatusTypeValues, User, Comment, TableIds } from './types';

const createProjects = (): Project => {
  const name = `project ${faker.lorem.words(1)}`;

  return {
    name,
    slug: faker.helpers.slugify(name),
    description: faker.lorem.sentence(),
    color: faker.color.rgb(),
  };
};

export const projects: Project[] = faker.helpers.multiple(createProjects, {
  count: 5,
});

const createUser = (): User => {
  const first_name = faker.person.firstName();
  const last_name = faker.person.lastName();

  return {
    slug: faker.helpers.slugify(`${first_name} ${last_name}`),
    first_name,
    last_name,
    email: faker.internet.email(),
    color: faker.color.rgb(),
    title: faker.person.jobTitle(),
  };
};

export const users: User[] = faker.helpers.multiple(createUser, {
  count: 28,
});

const createIssue = (users: TableIds, projects: TableIds): (() => Issue) => {
  return () => {
    const slug = faker.string.uuid();

    return {
      slug,
      name: faker.hacker.phrase(),
      due_date: faker.date.future(),
      status: faker.helpers.arrayElement(StatusTypeValues),
      owner_id: faker.helpers.arrayElement(users).id,
      story_points: faker.helpers.arrayElement([1, 2, 3, 5, 8, 13, 21]),
      description: faker.lorem.paragraph(),
      project_id: faker.helpers.arrayElement(projects).id,
    };
  };
};

export const createIssues = (users: TableIds, projects: TableIds): Issue[] => {
  const issue = createIssue(users, projects);

  return faker.helpers.multiple(issue, {
    count: 35,
  });
};

const createComment = (issues: TableIds, users: TableIds): (() => Comment) => {
  return () => ({
    issue_id: faker.helpers.arrayElement(issues).id,
    user_id: faker.helpers.arrayElement(users).id,
    content: faker.lorem.paragraph(),
  });
};

export const createComments = (issues: TableIds, users: TableIds): Comment[] => {
  const comment = createComment(issues, users);
  return faker.helpers.multiple(comment, {
    count: 200,
  });
};
