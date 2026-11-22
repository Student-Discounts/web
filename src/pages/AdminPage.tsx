import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi, type AdminUser, type IdentityEvent } from '../api/auth';
import { ACTION_NAMES, formatDate, ROLE_NAMES } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Notice, Spinner } from '../components/ui';

/** Панель старшего модератора: поиск пользователя, роли, блокировка, сессии и история. */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (value: string) => {
    setBusy(true);
    setError(null);
    setTarget(null);
    try {
      setTarget(await adminApi.findByEmail(value.trim()));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const initial = params.get('email');
    if (initial) search(initial);
    // Ищем только при открытии страницы по ссылке с ?email=, дальше — по кнопке.
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setParams({ email: email.trim() });
    search(email);
  };

  return (
    <>
      <form className="card search-form" onSubmit={onSubmit}>
        <h1>Пользователи</h1>
        <div className="row">
          <input
            type="email"
            placeholder="email пользователя"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            Найти
          </button>
        </div>
        <ErrorBox error={error} />
      </form>
      {target && <UserPanel key={target.id} initial={target} />}
    </>
  );
}

function UserPanel({ initial }: { initial: AdminUser }) {
  const { user: me } = useAuth();
  const [target, setTarget] = useState(initial);
  const [events, setEvents] = useState<IdentityEvent[] | null>(null);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSelf = me?.id === target.id;
  const isModerator = target.roles.includes('MODERATOR');
  const isSenior = target.roles.includes('SENIOR_MODERATOR');
  const blocked = target.status === 'BLOCKED';

  const refresh = useCallback(async () => {
    const [fresh, history] = await Promise.all([adminApi.find(initial.id), adminApi.events(initial.id)]);
    setTarget(fresh);
    setEvents(history);
  }, [initial.id]);

  useEffect(() => {
    refresh().catch(setError);
  }, [refresh]);

  // Исполнителей в истории показываем по email, а не по id.
  useEffect(() => {
    const ids = new Set<string>();
    events?.forEach((event) => event.actorId && ids.add(event.actorId));
    if (target.blockedBy) ids.add(target.blockedBy);
    const missing = [...ids].filter((id) => !(id in actors));
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) =>
        adminApi
          .find(id)
          .then((user) => [id, user.email] as const)
          .catch(() => [id, id] as const),
      ),
    ).then((pairs) => setActors((current) => ({ ...current, ...Object.fromEntries(pairs) })));
  }, [events, target.blockedBy, actors]);

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(done);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const actor = (id: string | null) => (id ? (actors[id] ?? id) : 'система при запуске');

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>
            {target.displayName} <span className="muted">{target.email}</span>
          </h2>
          <span className={blocked ? 'badge badge-danger' : 'badge badge-ok'}>
            {blocked ? 'Заблокирован' : 'Активен'}
          </span>
        </div>
        <dl className="props">
          <dt>Роли</dt>
          <dd>
            {target.roles.map((role) => (
              <span key={role} className="badge">
                {ROLE_NAMES[role]}
              </span>
            ))}
          </dd>
          <dt>Зарегистрирован</dt>
          <dd>{formatDate(target.createdAt)}</dd>
          {blocked && (
            <>
              <dt>Причина блокировки</dt>
              <dd>{target.blockedReason}</dd>
              <dt>Заблокировал</dt>
              <dd>
                {actor(target.blockedBy)}, {formatDate(target.blockedAt)}
              </dd>
            </>
          )}
          <dt>ID</dt>
          <dd>
            <code>{target.id}</code>
          </dd>
        </dl>

        {isSelf && <p className="muted small">Это вы: свои роли, блокировку и сессии здесь менять нельзя.</p>}
        <ErrorBox error={error} />
        <Notice text={notice} />

        <div className="action-groups">
          <div className="action-group">
            <h3>Роль модератора</h3>
            {isModerator ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => run(() => adminApi.revokeModerator(target.id), 'Роль модератора снята')}
              >
                Снять роль модератора
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => adminApi.grantModerator(target.id), 'Роль модератора назначена')}
              >
                Назначить модератором
              </button>
            )}
            <p className="hint">В токене пользователя роль появится при следующем обновлении, до 5 минут.</p>
          </div>

          <div className="action-group">
            <h3>Блокировка</h3>
            {blocked ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => adminApi.unblock(target.id), 'Аккаунт разблокирован')}
              >
                Разблокировать
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    await adminApi.block(target.id, reason.trim());
                    setReason('');
                  }, 'Аккаунт заблокирован, все его сессии завершены');
                }}
              >
                <textarea
                  placeholder="Причина, её увидят другие модераторы"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
                <button type="submit" className="danger" disabled={busy}>
                  Заблокировать
                </button>
                {isSenior && <p className="hint">Старшего модератора заблокировать нельзя — сервер откажет.</p>}
              </form>
            )}
          </div>

          <div className="action-group">
            <h3>Сессии</h3>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => run(() => adminApi.revokeSessions(target.id), 'Все сессии пользователя завершены')}
            >
              Завершить все сессии
            </button>
            <p className="hint">Без блокировки: пользователь сможет войти снова.</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>История</h2>
        <p className="muted small">Журнал нельзя изменить или удалить. Новые события сверху.</p>
        {events === null ? (
          <Spinner />
        ) : events.length === 0 ? (
          <p className="muted">Событий пока нет.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Событие</th>
                  <th>Кто</th>
                  <th>Причина</th>
                  <th>Подробности</th>
                  <th>Запрос</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.createdAt)}</td>
                    <td>{ACTION_NAMES[event.action] ?? event.action}</td>
                    <td>{actor(event.actorId)}</td>
                    <td>{event.reason ?? '—'}</td>
                    <td>
                      <Payload payload={event.payload} />
                    </td>
                    <td>
                      <code className="small">{event.correlationId ?? '—'}</code>
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

function Payload({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload ?? {});
  if (entries.length === 0) return <>—</>;
  return (
    <>
      {entries.map(([key, value]) => (
        <div key={key} className="small">
          {key}: <code>{String(value)}</code>
        </div>
      ))}
    </>
  );
}
