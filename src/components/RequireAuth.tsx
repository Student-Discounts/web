import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from './ui';
import { Card, CardContent } from './ui/card';
import { ROLE_NAMES } from '../api/messages';

/** Пускает только вошедших пользователей, а при заданных ролях — только с одной из них. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, hasRole } = useAuth();
  const location = useLocation();

  if (user === undefined) return <Spinner />;
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }
  if (roles && !hasRole(...roles)) {
    return (
      <Card>
        <CardContent className="space-y-2">
          <h1 className="text-2xl font-semibold">Нет доступа</h1>
          <p className="text-muted-foreground">Этот раздел доступен только ролям: {roles.map((role) => ROLE_NAMES[role]).join(', ')}.</p>
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}
