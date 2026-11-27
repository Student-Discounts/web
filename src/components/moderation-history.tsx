import { useState, type ReactNode } from 'react';
import { formatDate } from '@/api/messages';
import { getReviewDiff, getReviewHistory, getReviewVersion, getReviewVersions, type ReviewCommand } from '@/api/moderation';
import { SubmissionSnapshot } from '@/components/SubmissionSnapshot';
import { ErrorBox, Spinner } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { reviewActionLabels, reviewCommandLabels } from '@/components/moderation-labels';
import { pageSize, useRead, type ReadResult } from '@/lib/requests';

function ReadSection<T>({ read, children }: { read: ReadResult<T>; children: (data: T) => ReactNode }) {
  if (read.loading) return <Spinner />;
  if (read.error) return <div className="space-y-2"><ErrorBox error={read.error} /><Button variant="outline" onClick={read.reload}>Повторить загрузку</Button></div>;
  return read.data === undefined ? null : children(read.data);
}

function PagedHistory<T, Cursor extends string | number>({ label, read, cursors, setCursors, cursorOf, children }: {
  label: string;
  read: ReadResult<T[]>;
  cursors: Cursor[];
  setCursors: (cursors: Cursor[]) => void;
  cursorOf: (item: T) => Cursor;
  children: (data: T[]) => ReactNode;
}) {
  return <>
    <ReadSection read={read}>{children}</ReadSection>
    <div className="flex gap-2" aria-label={label}>
      <Button variant="outline" disabled={cursors.length === 0 || read.loading} onClick={() => setCursors(cursors.slice(0, -1))}>Назад</Button>
      <Button variant="outline" disabled={read.loading || !!read.error || read.data?.length !== pageSize} onClick={() => {
        const last = read.data?.at(-1);
        if (last !== undefined) setCursors([...cursors, cursorOf(last)]);
      }}>Далее</Button>
    </div>
  </>;
}

function JsonText({ value }: { value: unknown }) {
  return <pre className="max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{JSON.stringify(value, null, 2) ?? '—'}</pre>;
}

export function HistoricalReviewSnapshot({ id, versionNo, onClose }: { id: string; versionNo: number; onClose: () => void }) {
  const snapshot = useRead((signal) => getReviewVersion(id, versionNo, signal), `${id}:${versionNo}`);
  const diff = useRead((signal) => getReviewDiff(id, versionNo, signal), `${id}:${versionNo}`);
  return (
    <div className="space-y-4">
      <section className="space-y-3" aria-labelledby="historic-snapshot-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="historic-snapshot-title" className="text-xl font-semibold">Снимок версии №{versionNo} (только чтение)</h2>
          <Button variant="outline" onClick={onClose}>К текущей версии</Button>
        </div>
        <ReadSection read={snapshot}>{(data) => <>
          <p className="break-all text-sm text-muted-foreground">Автор заявки: {data.authorId} · {formatDate(data.occurredAt)}</p>
          <SubmissionSnapshot payload={data.payload} />
        </>}</ReadSection>
      </section>
      <Card>
        <CardHeader><CardTitle>{versionNo === 1 ? 'Изменения относительно пустой заявки' : `Изменения относительно версии №${versionNo - 1}`}</CardTitle></CardHeader>
        <CardContent>
          <ReadSection read={diff}>{(data) => data.length === 0 ? <p>Различий нет.</p> : (
            <ul className="space-y-4">
              {data.map((entry) => <li key={entry.path} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                <p><code className="break-all">{entry.path || 'Корень документа'}</code></p>
                <dl className="grid min-w-0 gap-2 md:grid-cols-2">
                  <div className="min-w-0"><dt>До</dt><dd><JsonText value={entry.before} /></dd></div>
                  <div className="min-w-0"><dt>После</dt><dd><JsonText value={entry.after} /></dd></div>
                </dl>
              </li>)}
            </ul>
          )}</ReadSection>
        </CardContent>
      </Card>
    </div>
  );
}

export function ModerationHistory({ id, versionsKey, auditKey, commands, selected, onSelect, disabled }: {
  id: string;
  versionsKey: string;
  auditKey: string;
  commands: ReviewCommand[];
  selected: number | undefined;
  onSelect: (versionNo: number) => void;
  disabled: boolean;
}) {
  const [versionCursors, setVersionCursors] = useState<number[]>([]);
  const [auditCursors, setAuditCursors] = useState<string[]>([]);
  const versionBefore = versionCursors.at(-1);
  const auditBefore = auditCursors.at(-1);
  const versions = useRead((signal) => getReviewVersions(id, versionBefore, signal), `${versionsKey}:${versionBefore ?? ''}`);
  const audit = useRead((signal) => getReviewHistory(id, auditBefore, signal), `${auditKey}:${auditBefore ?? ''}`);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Неизменяемые версии</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <PagedHistory label="Страницы версий" read={versions} cursors={versionCursors} setCursors={setVersionCursors} cursorOf={(version) => version.versionNo}>
            {(items) => items.length === 0 ? <p>На этой странице нет версий.</p> : (
              <ul className="flex flex-wrap gap-2">
                {items.map((version) => <li key={version.versionId}>
                  <Button variant={selected === version.versionNo ? 'secondary' : 'outline'} disabled={disabled} aria-pressed={selected === version.versionNo} onClick={() => onSelect(version.versionNo)}>Версия №{version.versionNo}</Button>
                </li>)}
              </ul>
            )}
          </PagedHistory>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Команды модерации</CardTitle></CardHeader>
        <CardContent>
          {commands.length === 0 ? <p>Команд пока нет.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Команда</TableHead><TableHead>Результат</TableHead><TableHead>Участник</TableHead><TableHead>Создана</TableHead><TableHead>Завершена</TableHead><TableHead>Причина / ошибка</TableHead></TableRow></TableHeader>
              <TableBody>
                {commands.map((command) => <TableRow key={command.id}>
                  <TableCell>{reviewActionLabels[command.action]} · №{command.versionNo}</TableCell>
                  <TableCell><Badge variant={command.state === 'REJECTED' || command.state === 'SUPERSEDED' ? 'destructive' : 'outline'}>{reviewCommandLabels[command.state]}</Badge></TableCell>
                  <TableCell>{command.actorId}</TableCell>
                  <TableCell>{formatDate(command.createdAt)}</TableCell>
                  <TableCell>{formatDate(command.resolvedAt)}</TableCell>
                  <TableCell className="whitespace-normal">{[command.reason, command.failure].filter(Boolean).join(' · ') || '—'}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Журнал действий</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <PagedHistory label="Страницы журнала" read={audit} cursors={auditCursors} setCursors={setAuditCursors} cursorOf={(item) => item.id}>
            {(items) => items.length === 0 ? <p>На этой странице нет записей.</p> : (
              <ul className="space-y-3">
                {items.map((item) => <li key={item.id} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
                  <p>{item.action} · {formatDate(item.occurredAt)}</p>
                  <p className="break-all text-sm text-muted-foreground">Участник: {item.actorId ?? 'Система'} · ID запроса: {item.correlationId}</p>
                  <JsonText value={item.detail} />
                </li>)}
              </ul>
            )}
          </PagedHistory>
        </CardContent>
      </Card>
    </div>
  );
}
