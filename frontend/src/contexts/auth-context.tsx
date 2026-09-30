import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import type { User } from '@/types';

type AuthContextValue = { user: User | null; isLoading: boolean; setUser: (user: User | null) => void };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: authApi.me, retry: false });
  return <AuthContext.Provider value={{
    user: data?.user ?? null, isLoading,
    setUser: (user) => queryClient.setQueryData(['me'], user ? { user } : null),
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
