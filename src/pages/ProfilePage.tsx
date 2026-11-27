import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, type Session } from '../api/auth';
import { formatDate, ROLE_NAMES } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Notice, Spinner } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useRead } from '@/lib/requests';

export function ProfilePage() {
  const { user, reload, forget } = useAuth();
  const navigate = useNavigate();
  const sessions = useRead(authApi.sessions, 'sessions');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const revoke = (session: Session) =>
    run(async () => {
      await authApi.revokeSession(session.id);
      sessions.reload();
    }, 'Сессия завершена: её refresh-токен больше не действует');

  const revokeAll = () =>
    run(async () => {
      await authApi.revokeAllSessions();
      forget();
      navigate('/login');
    }, 'Все сессии завершены');

  if (!user) return <Spinner />;

  return (
    <>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">{user.displayName}</h1>
            <Button type="button" variant="outline" disabled={busy} onClick={() => run(reload, 'Профиль обновлён')}>Обновить</Button>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-6">
            <dt className="text-muted-foreground">Email</dt><dd className="break-all">{user.email}</dd>
            <dt className="text-muted-foreground">Роли</dt>
            <dd className="flex flex-wrap gap-1">{user.roles.map((role) => <Badge key={role}>{ROLE_NAMES[role]}</Badge>)}</dd>
            <dt className="text-muted-foreground">Зарегистрирован</dt><dd>{formatDate(user.createdAt)}</dd>
            <dt className="text-muted-foreground">ID</dt><dd><code>{user.id}</code></dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Сессии</h2>
            <Button type="button" variant="destructive" disabled={busy} onClick={revokeAll}>Завершить все</Button>
          </div>
          <p className="text-sm text-muted-foreground">Сессия — это вход с одного устройства. После её завершения уже выданный access-токен действует до 5 минут.</p>
          <ErrorBox error={error ?? sessions.error} />
          <Notice text={notice} />
          {sessions.loading && <Spinner />}
          {!!sessions.error && <Button type="button" variant="outline" onClick={sessions.reload}>Повторить загрузку</Button>}
          {sessions.data?.length === 0 && <p className="text-muted-foreground">Активных сессий нет.</p>}
          {!!sessions.data?.length && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Устройство</TableHead><TableHead>Вход</TableHead>
                  <TableHead>Последнее обновление</TableHead><TableHead>Истекает</TableHead><TableHead>Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <span className="inline-block max-w-60 truncate align-middle" title={session.userAgent ?? ''}>{session.userAgent ?? '—'}</span>
                      {session.current && <Badge className="ml-2" variant="secondary">текущая</Badge>}
                    </TableCell>
                    <TableCell>{formatDate(session.createdAt)}</TableCell>
                    <TableCell>{formatDate(session.lastUsedAt)}</TableCell>
                    <TableCell>{formatDate(session.expiresAt)}</TableCell>
                    <TableCell>
                      {!session.current && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => revoke(session)}>Завершить</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
