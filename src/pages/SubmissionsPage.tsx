import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@/api/messages';
import { listSubmissions, submissionStatusLabels, submissionTypeLabels } from '@/api/submissions';
import { useAuth } from '@/auth/AuthContext';
import { ErrorBox, Notice, Spinner } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRead } from '@/lib/requests';

export function SubmissionsPage() {
  const { hasRole } = useAuth();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const before = cursors.at(-1) ?? null;
  const page = useRead((signal) => listSubmissions(before, signal), before ?? 'first');
  const next = page.data?.nextCursor;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Мои заявки</h1>
        <div className="flex flex-wrap gap-2">
          {hasRole('STUDENT') && <Button asChild><Link to="/submissions/new">Предложить новое место</Link></Button>}
          <Button type="button" variant="outline" onClick={page.reload} disabled={page.loading}>Обновить</Button>
        </div>
      </header>
      {page.loading && <Spinner />}
      {Boolean(page.error) && <div className="space-y-2">
        <ErrorBox error={page.error} />
        <Button type="button" variant="outline" onClick={page.reload}>Повторить загрузку</Button>
      </div>}
      {page.data && (page.data.items.length ? (
        <Table>
          <TableHeader><TableRow>
            <TableHead>ID заявки</TableHead><TableHead>Тип</TableHead><TableHead>Статус</TableHead><TableHead>Обновлена</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {page.data.items.map((item) => <TableRow key={item.id}>
              <TableCell><Link className="font-mono underline" to={`/submissions/${item.id}`}>{item.id}</Link></TableCell>
              <TableCell>{submissionTypeLabels[item.type]}</TableCell>
              <TableCell><Badge variant="secondary">{submissionStatusLabels[item.status]}</Badge></TableCell>
              <TableCell><time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      ) : <Notice>{before ? 'Больше заявок нет.' : 'У вас пока нет заявок.'}</Notice>)}
      <div className="flex flex-wrap gap-2" aria-label="Страницы заявок" role="group">
        <Button type="button" variant="outline" disabled={cursors.length < 2} onClick={() => setCursors((previous) => previous.slice(0, -1))}>Назад</Button>
        <Button type="button" variant="outline" disabled={next == null} onClick={() => { if (next) setCursors((previous) => [...previous, next]); }}>Далее</Button>
      </div>
    </section>
  );
}
