import { createContext, ReactNode, useState, useEffect } from 'react';
import type { User } from '@prisma/client';

export const UserContext = createContext<User | null>(null);

type UserProviderProps = {
  children: ReactNode;
};

export const UserProvider = ({ children }: UserProviderProps) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      console.log('fetching user...');
      const user = await (await fetch('/api/user')).json();
      console.log('user:', user);
      setUser(user);
    };

    fetchUser();
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};
