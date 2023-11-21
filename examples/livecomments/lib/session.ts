import type { User } from '@prisma/client';
import { getIronSession, createResponse } from 'iron-session';

export type SessionData = {
  user?: User;
};

export const getSession = (req: Request, res: Response) => {
  const session = getIronSession<SessionData>(req, res, {
    password: process.env.SESSION_SECRET!,
    cookieName: 'session',
    cookieOptions: {
      secure: false,
    },
  });
  return session;
};

export { createResponse };
