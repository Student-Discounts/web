import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, type Session } from '../api/auth';
import { formatDate, ROLE_NAMES } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Notice, Spinner } from '../components/ui';

export function ProfilePage() {
  const { user, reload, forget } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await authApi.sessions());
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const run = async (action: () => Promise<void>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
    } catch (e) {
      setError(e);
    }
  };

  const revoke = (session: Session) =>
    run(async () => {
      await authApi.revokeSession(session.id);
      await loadSessions();
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
      <section className="card">
        <div className="card-head">
          <h1>{user.displayName}</h1>
          <button type="button" className="secondary" onClick={() => run(reload, 'Профиль обновлён')}>
            Обновить
          </button>
        </div>
        <dl className="props">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Роли</dt>
          <dd>
            {user.roles.map((role) => (
              <span key={role} className="badge">
                {ROLE_NAMES[role]}
              </span>
            ))}
          </dd>
          <dt>Зарегистрирован</dt>
          <dd>{formatDate(user.createdAt)}</dd>
          <dt>ID</dt>
          <dd>
            <code>{user.id}</code>
          </dd>
        </dl>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Сессии</h2>
          <button type="button" className="danger" onClick={revokeAll}>
            Завершить все
          </button>
        </div>
        <p className="muted small">
          Сессия — это вход с одного устройства. Завершённая сессия не сможет обновить токен; уже выданный access-токен
          действует до 5 минут.
        </p>
        <ErrorBox error={error} />
        <Notice text={notice} />
        {sessions === null ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Устройство</th>
                  <th>Вход</th>
                  <th>Последнее обновление</th>
                  <th>Истекает</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="ellipsis" title={session.userAgent ?? ''}>
                      {session.userAgent ?? '—'}
                      {session.current && <span className="badge badge-accent">текущая</span>}
                    </td>
                    <td>{formatDate(session.createdAt)}</td>
                    <td>{formatDate(session.lastUsedAt)}</td>
                    <td>{formatDate(session.expiresAt)}</td>
                    <td className="actions">
                      {!session.current && (
                        <button type="button" className="secondary small" onClick={() => revoke(session)}>
                          Завершить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
