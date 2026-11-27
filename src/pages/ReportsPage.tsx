import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDate } from '@/api/messages';
import { reportCategoryNames, reportsApi, reportStateNames, type ReportCategory } from '@/api/reports';
import { useAuth } from '@/auth/AuthContext';
import { ErrorBox, Notice, Spinner } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { isUuid, pageSize, useIntent, useRead } from '@/lib/requests';

export function ReportsPage() {
  const { user, hasRole } = useAuth();
  return user && hasRole('STUDENT') ? <StudentReports key={user.id} /> : null;
}

function StudentReports() {
  const [params] = useSearchParams();
  const [submissionId, setSubmissionId] = useState(params.get('submissionId') ?? '');
  const [category, setCategory] = useState<ReportCategory>('OUTDATED');
  const [description, setDescription] = useState('');
  const [validation, setValidation] = useState<{ field: 'submissionId' | 'description'; message: string }>();
  const [notice, setNotice] = useState('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const before = cursors.at(-1);
  const list = useRead((signal) => reportsApi.own(before, signal), before ?? '');
  const intent = useIntent();
  const locked = intent.busy || intent.uncertain;
  const nextCursor = list.data?.length === pageSize ? list.data.at(-1)?.id : undefined;

  function refreshFirstPage() {
    if (before) setCursors([undefined]);
    else list.reload();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    setNotice('');
    intent.resetError();
    const body = { submissionId: submissionId.trim(), category, description: description.trim() };
    if (!isUuid(body.submissionId)) {
      setValidation({ field: 'submissionId', message: 'Введите корректный UUID заявки.' });
      return;
    }
    if (!body.description || body.description.length > 2000) {
      setValidation({ field: 'description', message: 'Введите описание длиной от 1 до 2000 символов.' });
      return;
    }
    setValidation(undefined);
    void intent.run(async (key) => {
      const result = await reportsApi.create(body, key);
      setDescription('');
      setNotice(`Жалоба ${result.id} принята. Статус: ${reportStateNames[result.state]}.`);
      refreshFirstPage();
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Жалобы</h1>
        <p className="text-muted-foreground">Подача жалобы не скрывает опубликованную карточку.</p>
      </header>
      <Card>
        <CardHeader><CardTitle>Сообщить о проблеме</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {notice && <Notice>{notice}</Notice>}
          <ErrorBox error={intent.error} />
          {intent.uncertain && (
            <div className="space-y-2">
              <p role="status">Не удалось подтвердить отправку. Можно повторить ту же отправку без создания новой жалобы.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={intent.busy} onClick={() => void intent.retry()}>Повторить отправку</Button>
                <Button type="button" variant="outline" disabled={intent.busy} onClick={() => { intent.clear(); refreshFirstPage(); }}>Отказаться от повтора</Button>
              </div>
            </div>
          )}
          <form onSubmit={submit}>
            <fieldset className="space-y-4" disabled={locked}>
              <div className="grid gap-2">
                <Label htmlFor="report-submission">ID заявки</Label>
                <Input id="report-submission" required value={submissionId} autoComplete="off" spellCheck={false}
                  aria-invalid={validation?.field === 'submissionId' || undefined}
                  aria-describedby={validation?.field === 'submissionId' ? 'report-validation' : undefined}
                  onChange={(event) => { setSubmissionId(event.target.value); setValidation(undefined); }} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="report-category">Категория</Label>
                <NativeSelect id="report-category" value={category} onChange={(event) => setCategory(event.target.value as ReportCategory)}>
                  {Object.entries(reportCategoryNames).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="report-description">Описание</Label>
                <Textarea id="report-description" required maxLength={2000} rows={4} value={description}
                  aria-invalid={validation?.field === 'description' || undefined}
                  aria-describedby={validation?.field === 'description' ? 'report-validation' : undefined}
                  onChange={(event) => { setDescription(event.target.value); setValidation(undefined); }} />
              </div>
              {validation && <p id="report-validation" role="alert" className="text-sm text-destructive">{validation.message}</p>}
              <Button type="submit">{intent.busy ? 'Отправляется…' : 'Отправить жалобу'}</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      <section aria-labelledby="own-reports-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="own-reports-heading" className="text-xl font-semibold">Мои жалобы</h2>
          <Button type="button" variant="outline" disabled={list.loading} onClick={list.reload}>{list.error ? 'Повторить загрузку' : 'Обновить'}</Button>
        </div>
        {list.loading && <Spinner />}
        <ErrorBox error={list.error} />
        {!list.loading && !list.error && list.data && (
          list.data.length === 0 ? <p className="text-muted-foreground">На этой странице жалоб нет.</p> : (
            <ul className="grid gap-3">
              {list.data.map((report) => (
                <li key={report.id}>
                  <Card>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>{reportCategoryNames[report.category]}</CardTitle>
                      <Badge variant="secondary">{reportStateNames[report.state]}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2 wrap-anywhere">
                      <p className="whitespace-pre-wrap">{report.description}</p>
                      {report.resolution && <p className="whitespace-pre-wrap"><strong>Комментарий модератора:</strong> {report.resolution}</p>}
                      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                        <dt>Подана</dt><dd>{formatDate(report.createdAt)}</dd>
                        <dt>ID жалобы</dt><dd><code>{report.id}</code></dd>
                        <dt>ID заявки</dt><dd><code>{report.submissionId}</code></dd>
                      </dl>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )
        )}
        {(cursors.length > 1 || nextCursor) && (
          <nav aria-label="Страницы моих жалоб" className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={list.loading || locked || cursors.length === 1}
              onClick={() => setCursors((current) => current.slice(0, -1))}>Предыдущая</Button>
            <Button type="button" variant="outline" disabled={list.loading || Boolean(list.error) || locked || !nextCursor}
              onClick={() => { if (nextCursor) setCursors((current) => [...current, nextCursor]); }}>Следующая</Button>
          </nav>
        )}
      </section>
    </div>
  );
}
