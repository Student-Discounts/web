import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from './ui';

/** Пускает только вошедших пользователей, а при заданных ролях — только с одной из них. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, hasRole } = useAuth();
  const location = useLocation();

  if (user === undefined) return <Spinner />;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !hasRole(...roles)) {
    return (
      <div className="card">
        <h1>Нет доступа</h1>
        <p className="muted">Этот раздел доступен только ролям: {roles.join(', ')}.</p>
      </div>
    );
  }
  return <>{children}</>;
}
