import { api, publicApi, type TokenPair } from './http';

export type Role = 'STUDENT' | 'ORG_REPRESENTATIVE' | 'MODERATOR' | 'SENIOR_MODERATOR';

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  createdAt: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AdminUser extends User {
  status: 'ACTIVE' | 'BLOCKED';
  blockedAt: string | null;
  blockedReason: string | null;
  blockedBy: string | null;
}

export type IdentityAction =
  | 'ROLE_GRANTED'
  | 'ROLE_REVOKED'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_UNBLOCKED'
  | 'SESSIONS_REVOKED';

export interface IdentityEvent {
  id: string;
  action: IdentityAction;
  actorId: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
}

const user = (id: string) => `/api/v1/users/${encodeURIComponent(id)}`;

export const authApi = {
  register: (email: string, password: string, displayName: string) =>
    publicApi<User>('POST', '/api/v1/auth/register', { email, password, displayName }),
  login: (email: string, password: string) =>
    publicApi<TokenPair>('POST', '/api/v1/auth/login', { email, password }),
  logout: () => api<void>('POST', '/api/v1/auth/logout'),
  me: () => api<User>('GET', '/api/v1/me'),
  sessions: (signal?: AbortSignal) => api<Session[]>('GET', '/api/v1/me/sessions', undefined, { signal }),
  revokeSession: (id: string) => api<void>('DELETE', `/api/v1/me/sessions/${encodeURIComponent(id)}`),
  revokeAllSessions: () => api<void>('DELETE', '/api/v1/me/sessions'),
};

export const adminApi = {
  findByEmail: (email: string, signal?: AbortSignal) => api<AdminUser>('GET', `/api/v1/users?email=${encodeURIComponent(email)}`, undefined, { signal }),
  find: (id: string, signal?: AbortSignal) => api<AdminUser>('GET', user(id), undefined, { signal }),
  grantModerator: (id: string) => api<void>('PUT', `${user(id)}/roles/MODERATOR`),
  revokeModerator: (id: string) => api<void>('DELETE', `${user(id)}/roles/MODERATOR`),
  block: (id: string, reason: string) => api<void>('POST', `${user(id)}/block`, { reason }),
  unblock: (id: string) => api<void>('POST', `${user(id)}/unblock`),
  revokeSessions: (id: string) => api<void>('DELETE', `${user(id)}/sessions`),
  events: (id: string, signal?: AbortSignal) => api<IdentityEvent[]>('GET', `${user(id)}/identity-events?limit=50`, undefined, { signal }),
};
