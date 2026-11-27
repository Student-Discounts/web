import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getReviewQueue } from '@/api/moderation';
import { ErrorBox, Spinner } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isUuid, pageSize, useRead } from '@/lib/requests';
import { reviewStatusLabel } from '@/components/moderation-labels';

export function ModerationPage() {
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const [lookup, setLookup] = useState('');
  const [invalidLookup, setInvalidLookup] = useState(false);
  const lookupInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const before = cursors.at(-1);
  const reviews = useRead((signal) => getReviewQueue(escalatedOnly, before, signal), `${escalatedOnly}:${before ?? ''}`);

  function openReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = lookup.trim();
    if (!isUuid(id)) {
      setInvalidLookup(true);
      lookupInput.current?.focus();
      return;
    }
    navigate(`/moderation/reviews/${id}`);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Модерация</h1>
        <nav aria-label="Разделы модерации" className="flex flex-wrap items-center gap-4 text-sm">
          <Link to="/moderation" aria-current="page" className="font-medium">Заявки</Link>
          <Link to="/moderation/reports" className="underline underline-offset-4">Жалобы</Link>
        </nav>
      </header>

      <Card>
        <CardHeader><CardTitle>Найти заявку</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={openReview} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-64 space-y-2">
              <Label htmlFor="review-id">ID заявки</Label>
              <Input ref={lookupInput} id="review-id" value={lookup} onChange={(event) => { setLookup(event.target.value); setInvalidLookup(false); }} required aria-invalid={invalidLookup} aria-describedby={invalidLookup ? 'review-lookup-hint' : undefined} />
              {invalidLookup && <p id="review-lookup-hint" role="alert" className="text-sm text-destructive">Введите корректный UUID заявки.</p>}
            </div>
            <Button type="submit">Открыть</Button>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="review-queue-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="review-queue-title" className="text-xl font-semibold">Очередь заявок</h2>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring" checked={escalatedOnly} onChange={(event) => { setEscalatedOnly(event.target.checked); setCursors([]); }} />
              Только эскалированные
            </label>
            <Button type="button" variant="outline" onClick={reviews.reload} disabled={reviews.loading}>Обновить</Button>
          </div>
        </div>
        {reviews.loading ? <Spinner /> : reviews.error ? (
          <div className="space-y-2"><ErrorBox error={reviews.error} /><Button variant="outline" onClick={reviews.reload}>Повторить загрузку</Button></div>
        ) : reviews.data && (reviews.data.length === 0 ? <p>В этой части очереди нет заявок.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>ID заявки</TableHead><TableHead>Версия</TableHead><TableHead>Статус</TableHead><TableHead>Проверяющий</TableHead><TableHead>Эскалация</TableHead></TableRow></TableHeader>
            <TableBody>
              {reviews.data.map((review) => (
                <TableRow key={review.submissionId}>
                  <TableCell><Link className="font-medium underline underline-offset-4" to={`/moderation/reviews/${review.submissionId}`}>{review.submissionId}</Link></TableCell>
                  <TableCell>{review.versionNo ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline">{reviewStatusLabel(review.status)}</Badge>{review.pendingCommandId && <span className="ml-2 text-muted-foreground">Ожидается команда</span>}</TableCell>
                  <TableCell>{review.reviewerId ?? 'Не назначен'}</TableCell>
                  <TableCell>{review.escalated ? 'Да' : 'Нет'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
        <div className="flex flex-wrap gap-2" aria-label="Страницы очереди">
          <Button type="button" variant="outline" disabled={!before || reviews.loading} onClick={() => setCursors((stack) => stack.slice(0, -1))}>Назад</Button>
          <Button type="button" variant="outline" disabled={reviews.loading || !!reviews.error || reviews.data?.length !== pageSize} onClick={() => {
            const next = reviews.data?.at(-1)?.submissionId;
            if (next) setCursors((stack) => [...stack, next]);
          }}>Далее</Button>
        </div>
      </section>
    </div>
  );
}
