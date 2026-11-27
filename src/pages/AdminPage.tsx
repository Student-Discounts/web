import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi, type AdminUser, type IdentityEvent } from '../api/auth';
import { ACTION_NAMES, formatDate, ROLE_NAMES } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Notice, Spinner } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import { useRead } from '@/lib/requests';

/** Панель старшего модератора: поиск пользователя, роли, блокировка, сессии и история. */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const applied = params.get('email') ?? '';
  const [email, setEmail] = useState(applied);
  const target = useRead(async (signal) => applied ? adminApi.findByEmail(applied, signal) : null, applied);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = email.trim();
    if (next === applied) target.reload();
    else setParams({ email: next });
  };

  return (
    <>
      <Card>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <h1 className="text-2xl font-semibold">Пользователи</h1>
            <div className="grid max-w-lg gap-1.5">
              <Label htmlFor="admin-email">Email пользователя</Label>
              <div className="flex gap-2">
                <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Button type="submit" disabled={!!applied && target.loading}>Найти</Button>
              </div>
            </div>
            {!!applied && target.loading && <Spinner />}
            <ErrorBox error={target.error} />
            {!!target.error && <Button type="button" variant="outline" className="justify-self-start" onClick={target.reload}>Повторить поиск</Button>}
          </form>
        </CardContent>
      </Card>
      {target.data && <UserPanel key={target.data.id} initial={target.data} />}
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

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [fresh, history] = await Promise.all([adminApi.find(initial.id, signal), adminApi.events(initial.id, signal)]);
    if (!signal?.aborted) {
      setTarget(fresh);
      setEvents(history);
    }
  }, [initial.id]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch((error) => { if (!controller.signal.aborted) setError(error); });
    return () => controller.abort();
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
      <Card>
        <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {target.displayName} <span className="break-all font-normal text-muted-foreground">{target.email}</span>
          </h2>
          <Badge variant={blocked ? 'destructive' : 'secondary'}>{blocked ? 'Заблокирован' : 'Активен'}</Badge>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-6 [&_dt]:text-muted-foreground">
          <dt>Роли</dt>
          <dd className="flex flex-wrap gap-1">
            {target.roles.map((role) => <Badge key={role}>{ROLE_NAMES[role]}</Badge>)}
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

        {isSelf && <p className="text-sm text-muted-foreground">Это вы: свои роли, блокировку и сессии здесь менять нельзя.</p>}
        <ErrorBox error={error} />
        <Notice text={notice} />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2 rounded-lg border p-3">
            <h3 className="font-semibold">Роль модератора</h3>
            {isModerator ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => adminApi.revokeModerator(target.id), 'Роль модератора снята')}>
                Снять роль модератора
              </Button>
            ) : (
              <Button type="button" disabled={busy} onClick={() => run(() => adminApi.grantModerator(target.id), 'Роль модератора назначена')}>
                Назначить модератором
              </Button>
            )}
            <p className="text-xs text-muted-foreground">В токене пользователя роль появится при следующем обновлении, до 5 минут.</p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <h3 className="font-semibold">Блокировка</h3>
            {blocked ? (
              <Button type="button" disabled={busy} onClick={() => run(() => adminApi.unblock(target.id), 'Аккаунт разблокирован')}>Разблокировать</Button>
            ) : (
              <form className="grid gap-2" onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await adminApi.block(target.id, reason.trim());
                  setReason('');
                }, 'Аккаунт заблокирован, все его сессии завершены');
              }}>
                <Label htmlFor="block-reason">Причина блокировки</Label>
                <Textarea id="block-reason" placeholder="Видна другим модераторам" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
                <Button type="submit" variant="destructive" className="justify-self-start" disabled={busy}>Заблокировать</Button>
                {isSenior && <p className="text-xs text-muted-foreground">Старшего модератора заблокировать нельзя — сервер откажет.</p>}
              </form>
            )}
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <h3 className="font-semibold">Сессии</h3>
            <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => adminApi.revokeSessions(target.id), 'Все сессии пользователя завершены')}>
              Завершить все сессии
            </Button>
            <p className="text-xs text-muted-foreground">Без блокировки: пользователь сможет войти снова.</p>
          </div>
        </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <h2 className="text-xl font-semibold">История</h2>
          <p className="text-sm text-muted-foreground">Журнал нельзя изменить или удалить. Новые события сверху.</p>
          {events === null ? (
            error
              ? <Button type="button" variant="outline" onClick={() => { setError(null); refresh().catch(setError); }}>Повторить загрузку</Button>
              : <Spinner />
          ) : events.length === 0 ? (
            <p className="text-muted-foreground">Событий пока нет.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead><TableHead>Событие</TableHead><TableHead>Кто</TableHead>
                  <TableHead>Причина</TableHead><TableHead>Подробности</TableHead><TableHead>Запрос</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDate(event.createdAt)}</TableCell>
                    <TableCell>{ACTION_NAMES[event.action] ?? event.action}</TableCell>
                    <TableCell>{actor(event.actorId)}</TableCell>
                    <TableCell className="min-w-32 whitespace-normal">{event.reason ?? '—'}</TableCell>
                    <TableCell><Payload payload={event.payload} /></TableCell>
                    <TableCell><code className="text-xs">{event.correlationId ?? '—'}</code></TableCell>
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

function Payload({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload ?? {});
  if (entries.length === 0) return <>—</>;
  return (
    <>
      {entries.map(([key, value]) => (
        <div key={key} className="text-xs">
          {key}: <code>{String(value)}</code>
        </div>
      ))}
    </>
  );
}
