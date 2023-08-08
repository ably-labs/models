import { createContext, ReactNode } from 'react';
import type { Author as AuthorType } from '@/lib/prisma/api';

export const AuthorContext = createContext<AuthorType | null>(null);

export const AuthorProvider = ({ author, children }: {
  author: AuthorType;
  children: ReactNode;
}) => {
  return <AuthorContext.Provider value={author}>{children}</AuthorContext.Provider>;
};
