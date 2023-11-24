import { faker } from '@faker-js/faker';
import { Issue, Project, StatusTypeValues, User, Comment } from './types';

const createProjects = (): Project => {
  const name = `project ${faker.lorem.words(1)}`;

  return {
    id: faker.string.uuid(),
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
    id: faker.string.uuid(),
    slug: faker.helpers.slugify(`${first_name} ${last_name}`),
    first_name,
    last_name,
    email: faker.internet.email(),
    color: faker.color.rgb(),
    date_added: faker.date.past({ years: 5 }),
    title: faker.person.jobTitle(),
  };
};

export const users: User[] = faker.helpers.multiple(createUser, {
  count: 28,
});

const createIssue = (): Issue => {
  const id = faker.string.uuid();
  return {
    id,
    slug: faker.helpers.slugify(id),
    name: faker.hacker.phrase(),
    due_date: faker.date.future(),
    status: faker.helpers.arrayElement(StatusTypeValues),
    owner: faker.helpers.arrayElement(users).id,
    story_points: faker.helpers.arrayElement([1, 2, 3, 5, 8, 13, 21]),
    description: faker.lorem.paragraph(),
    project_id: faker.helpers.arrayElement(projects).id,
  };
};

export const issues: Issue[] = faker.helpers.multiple(createIssue, {
  count: 35,
});

const createComment = (): Comment => {
  return {
    id: faker.string.uuid(),
    issue: faker.helpers.arrayElement(issues).id,
    user_id: faker.helpers.arrayElement(users).id,
    created_on: faker.date.past(),
    content: faker.lorem.paragraph(),
  };
};

export const comments: Comment[] = faker.helpers.multiple(createComment, {
  count: 200,
});
