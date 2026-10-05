import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { SESSION_EVENT, setActiveOrganizationId } from '@/api/client';
import type { Membership, Permission, Session, User } from '@/types';

const STORAGE_KEY = 'fieldproof.activeOrganization';

function readStoredOrg() {
  try { return localStorage.getItem(STORAGE_KEY) ?? undefined; } catch { return undefined; }
}
function storeOrg(id: string | undefined) {
  try { if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
}

type AuthContextValue = {
  user: User | null;
  memberships: Membership[];
  /** The organization the workspace is showing; null only when the user belongs to none. */
  membership: Membership | null;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
  /** Store a fresh session after sign-in/sign-up (drops anything cached for a previous user). */
  setSession: (session: Session) => void;
  setUser: (user: User | null) => void;
  switchOrganization: (organizationId: string) => void;
  refreshSession: () => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: authApi.me, retry: false });
  const [preferredOrg, setPreferredOrg] = useState(readStoredOrg);
  const memberships = useMemo(() => data?.memberships ?? [], [data]);
  const membership = memberships.find((m) => m.organization.id === preferredOrg) ?? memberships[0] ?? null;

  // Set synchronously during render: child queries start before this
  // provider's effects run, and they must already carry the right org.
  setActiveOrganizationId(membership?.organization.id);

  const dropWorkspaceData = useCallback(
    () => queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' }),
    [queryClient],
  );

  const switchOrganization = useCallback((organizationId: string) => {
    if (organizationId === membership?.organization.id) return;
    // Nothing cached for one organization may ever render inside another.
    setActiveOrganizationId(organizationId);
    dropWorkspaceData();
    storeOrg(organizationId);
    setPreferredOrg(organizationId);
  }, [dropWorkspaceData, membership?.organization.id]);

  const refreshSession = useCallback(() => queryClient.invalidateQueries({ queryKey: ['me'] }), [queryClient]);

  useEffect(() => {
    const onSessionEvent = (event: Event) => {
      const { status } = (event as CustomEvent<{ status: number; code?: string }>).detail;
      if (status === 401) {
        queryClient.clear();
        queryClient.setQueryData(['me'], null);
      } else {
        // Removed from the active org, or it no longer exists: re-read memberships.
        dropWorkspaceData();
        void refreshSession();
      }
    };
    window.addEventListener(SESSION_EVENT, onSessionEvent);
    return () => window.removeEventListener(SESSION_EVENT, onSessionEvent);
  }, [dropWorkspaceData, queryClient, refreshSession]);

  const value: AuthContextValue = {
    user: data?.user ?? null,
    memberships,
    membership,
    isLoading,
    can: (permission) => Boolean(membership?.permissions.includes(permission)),
    setSession: (session) => {
      queryClient.clear();
      queryClient.setQueryData(['me'], session);
    },
    setUser: (user) => {
      if (!user) {
        queryClient.clear();
        queryClient.setQueryData(['me'], null);
      } else queryClient.setQueryData(['me'], (current: Session | undefined) => (current ? { ...current, user } : current));
    },
    switchOrganization,
    refreshSession,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
