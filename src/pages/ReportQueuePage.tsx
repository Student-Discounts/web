import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@/api/messages';
import { reportCategoryNames, reportsApi, reportStateNames, type Report, type ReportAction } from '@/api/reports';
import { useAuth } from '@/auth/AuthContext';
import { ErrorBox, Notice, Spinner } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { isConflict, pageSize, useIntent, useRead } from '@/lib/requests';

const actionNames: Record<ReportAction, string> = {
  TRIAGE: 'Взять на рассмотрение',
  ESCALATE: 'Передать старшему модератору',
  RESOLVE: 'Завершить рассмотрение',
};
const moderatorActions: readonly ReportAction[] = ['TRIAGE', 'ESCALATE'];
const seniorActions: readonly ReportAction[] = ['TRIAGE', 'ESCALATE', 'RESOLVE'];

function canAct(report: Report, reviewerId: string, senior: boolean) {
  return report.reporterId !== reviewerId && report.state !== 'RESOLVED' &&
    (senior || (report.state !== 'ESCALATED' && (!report.assignedTo || report.assignedTo === reviewerId)));
}

interface Selection {
  id: string;
  action: ReportAction;
  reason: string;
}

export function ReportQueuePage() {
  const { user, hasRole } = useAuth();
  return user && hasRole('MODERATOR', 'SENIOR_MODERATOR')
    ? <ReportQueue key={user.id} reviewerId={user.id} senior={hasRole('SENIOR_MODERATOR')} />
    : null;
}

function ReportQueue({ reviewerId, senior }: { reviewerId: string; senior: boolean }) {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const before = cursors.at(-1);
  const list = useRead((signal) => reportsApi.queue(before, signal), before ?? '');
  const intent = useIntent();
  const [selection, setSelection] = useState<Selection>();
  const [reasonError, setReasonError] = useState(false);
  const [notice, setNotice] = useState('');
  const [local, setLocal] = useState<{ source: Report[]; rows: Report[] }>();
  const [blockedPage, setBlockedPage] = useState<Report[]>();
  const data = list.data;
  const rows = local && local.source === data ? local.rows : data;
  // Compute the cursor from the server page, not from locally updated or removed rows.
  const nextCursor = data?.length === pageSize ? data.at(-1)?.id : undefined;
  const blocked = data !== undefined && blockedPage === data;
  const locked = intent.busy || intent.uncertain;
  const actions = senior ? seniorActions : moderatorActions;

  function select(report: Report) {
    if (locked || blocked || selection?.id === report.id) return;
    intent.resetError();
    setReasonError(false);
    setSelection({ id: report.id, action: 'TRIAGE', reason: '' });
  }

  function refresh() {
    intent.resetError();
    list.reload();
  }

  function submit(event: FormEvent<HTMLFormElement>, report: Report) {
    event.preventDefault();
    if (!data || !rows || locked || blocked || list.loading || list.error || selection?.id !== report.id ||
        !canAct(report, reviewerId, senior) || !actions.includes(selection.action)) return;
    intent.resetError();
    setNotice('');
    const reason = selection.reason.trim();
    if (!reason || reason.length > 2000) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    const body = { action: selection.action, reason };
    void intent.run(async (key) => {
      try {
        const updated = await reportsApi.act(report, body, key);
        setLocal({ source: data, rows: updated.state === 'RESOLVED'
          ? rows.filter((row) => row.id !== updated.id)
          : rows.map((row) => row.id === updated.id ? updated : row) });
        setSelection(undefined);
        setNotice(`Жалоба ${updated.id}. Статус: ${reportStateNames[updated.state]}.`);
      } catch (error) {
        if (isConflict(error)) setBlockedPage(data);
        throw error;
      }
    });
  }

  const selected = rows?.find((report) => report.id === selection?.id);
  const canRetry = selected && selection && canAct(selected, reviewerId, senior) && actions.includes(selection.action);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link to="/moderation" className="text-sm underline underline-offset-4">К очереди заявок</Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-semibold">Очередь жалоб</h1>
          <Button type="button" variant="outline" disabled={list.loading || locked} onClick={refresh}>{list.error ? 'Повторить загрузку' : 'Обновить'}</Button>
        </div>
      </header>
      {notice && <Notice>{notice}</Notice>}
      <ErrorBox error={intent.error} />
      {blocked && !intent.uncertain && (
        <p role="status">Данные жалобы могли измениться. Обновите очередь и проверьте жалобу перед повторным действием.</p>
      )}
      {intent.uncertain && (
        <div className="space-y-2">
          <p role="status">Результат действия неизвестен. Повтор отправит то же действие с тем же ключом.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={intent.busy || !canRetry} onClick={() => void intent.retry()}>Повторить действие</Button>
            <Button type="button" variant="outline" disabled={intent.busy} onClick={() => {
              setBlockedPage(data);
              intent.clear();
              list.reload();
            }}>Не повторять и обновить очередь</Button>
          </div>
        </div>
      )}
      {list.loading && <Spinner />}
      <ErrorBox error={list.error} />
      {!list.loading && !list.error && rows && (
        rows.length === 0 ? <p className="text-muted-foreground">На этой странице нет нерассмотренных жалоб.</p> : (
          <ul className="grid gap-3">
            {rows.map((report) => {
              const eligible = canAct(report, reviewerId, senior);
              const editing = selection?.id === report.id ? selection : undefined;
              return (
                <li key={report.id}>
                  <Card>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>{reportCategoryNames[report.category]}</CardTitle>
                      <Badge variant="secondary">{reportStateNames[report.state]}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3 wrap-anywhere">
                      <p className="whitespace-pre-wrap">{report.description}</p>
                      {report.resolution && <p className="whitespace-pre-wrap"><strong>Комментарий модератора:</strong> {report.resolution}</p>}
                      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                        <dt>Подана</dt><dd>{formatDate(report.createdAt)}</dd>
                        <dt>ID жалобы</dt><dd><code>{report.id}</code></dd>
                        <dt>ID заявки</dt><dd><code>{report.submissionId}</code></dd>
                        <dt>Автор</dt><dd>{report.reporterId === reviewerId ? 'Вы' : <code>{report.reporterId}</code>}</dd>
                        <dt>Назначена</dt><dd>{report.assignedTo === reviewerId ? 'Вам' : report.assignedTo ? <code>{report.assignedTo}</code> : 'Не назначена'}</dd>
                      </dl>
                      {eligible && !editing && (
                        <Button type="button" variant="outline" disabled={locked || blocked}
                          aria-label={`Рассмотреть жалобу ${report.id}`} onClick={() => select(report)}>Рассмотреть</Button>
                      )}
                      {eligible && editing && (
                        <form onSubmit={(event) => submit(event, report)}>
                          <fieldset disabled={locked || blocked} className="space-y-3 border-t pt-3">
                            <div className="grid gap-2">
                              <Label htmlFor="report-action">Действие</Label>
                              <NativeSelect id="report-action" value={editing.action} onChange={(event) => setSelection({ ...editing, action: event.target.value as ReportAction })}>
                                {actions.map((action) => <NativeSelectOption key={action} value={action}>{actionNames[action]}</NativeSelectOption>)}
                              </NativeSelect>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="report-reason">Причина</Label>
                              <Textarea id="report-reason" required maxLength={2000} rows={3} value={editing.reason}
                                aria-invalid={reasonError || undefined}
                                aria-describedby={reasonError ? 'report-reason-error' : undefined}
                                onChange={(event) => { setSelection({ ...editing, reason: event.target.value }); setReasonError(false); }} />
                              {reasonError && <p id="report-reason-error" role="alert" className="text-sm text-destructive">Введите причину длиной от 1 до 2000 символов.</p>}
                            </div>
                            <Button type="submit">{intent.busy ? 'Отправляется…' : 'Применить действие'}</Button>
                          </fieldset>
                        </form>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )
      )}
      {(cursors.length > 1 || nextCursor) && (
        <nav aria-label="Страницы очереди жалоб" className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={list.loading || locked || blocked || cursors.length === 1}
            onClick={() => { setSelection(undefined); setCursors((current) => current.slice(0, -1)); }}>Предыдущая</Button>
          <Button type="button" variant="outline" disabled={list.loading || Boolean(list.error) || locked || blocked || !nextCursor}
            onClick={() => { if (nextCursor) { setSelection(undefined); setCursors((current) => [...current, nextCursor]); } }}>Следующая</Button>
        </nav>
      )}
    </div>
  );
}
