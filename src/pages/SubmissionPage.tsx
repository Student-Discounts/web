import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDiscount, getPlace } from '@/api/catalog';
import { ApiError } from '@/api/http';
import { formatDate } from '@/api/messages';
import {
  cancelSubmission, createSubmission, getSubmission, getSubmissionVersion, listSubmissionHistory,
  listSubmissionVersions, saveSubmission, submissionStatusLabels, submissionTypeLabels, submitSubmission,
  type DraftPayload, type SubmissionRecord, type SubmissionType,
} from '@/api/submissions';
import { useAuth } from '@/auth/AuthContext';
import { SubmissionForm } from '@/components/SubmissionForm';
import { SubmissionSnapshot } from '@/components/SubmissionSnapshot';
import { buildDraftPatch, reapplyDraftPatch } from '@/components/submission-payload';
import { ErrorBox, Notice, Spinner } from '@/components/ui';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isAmbiguous, isConflict, isUuid, useIntent, useRead } from '@/lib/requests';

function NewSubmission({ placeId, offerId }: { placeId: string | null; offerId: string | null }) {
  const { hasRole } = useAuth();
  const type: SubmissionType = offerId !== null ? 'CHANGE' : placeId !== null ? 'NEW_OFFER' : 'NEW_PLACE';
  const invalidTarget = (offerId !== null && (placeId === null || !isUuid(offerId))) || (placeId !== null && !isUuid(placeId));
  if (invalidTarget) return <Notice>Для заявки нужны действительные ID места и, при изменении скидки, её ID.</Notice>;
  if (!hasRole('STUDENT') && (type === 'NEW_PLACE' || !hasRole('ORG_REPRESENTATIVE'))) {
    return <Notice>{type === 'NEW_PLACE' ? 'Только студенты могут предложить новое место.' : 'Только студенты и представители организаций могут предложить изменение.'}</Notice>;
  }
  return placeId === null ? <CreateDraft type="NEW_PLACE" /> : <ConfirmTarget placeId={placeId} offerId={offerId} />;
}

function ConfirmTarget({ placeId, offerId }: { placeId: string; offerId: string | null }) {
  const place = useRead((signal) => getPlace(placeId, signal), placeId);
  if (place.loading) return <Spinner />;
  if (!place.data) return (
    <div className="space-y-2">
      <ErrorBox error={place.error} />
      <Button type="button" variant="outline" onClick={place.reload}>Повторить загрузку места</Button>
    </div>
  );
  const target = place.data;
  const offer = target.offers.find((item) => item.id === offerId?.toLowerCase());
  return (
    <div className="grid gap-4">
      <section className="grid gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">Опубликованное место: {target.name}</h2>
        <p>{target.city}, {target.addressLine}</p>
        {offer && <p className="wrap-break-word">Скидка: {formatDiscount(offer.discountType, offer.discountValue)} · {offer.conditions}</p>}
        <Link className="w-fit underline" to={`/places/${placeId}`}>Открыть карточку места</Link>
      </section>
      {offerId && !offer ? (
        <Notice>Скидка не найдена среди опубликованных скидок этого места. Черновик не создан.</Notice>
      ) : (
        <CreateDraft type={offer ? 'CHANGE' : 'NEW_OFFER'} placeId={placeId} offerId={offer?.id} />
      )}
    </div>
  );
}

function CreateDraft({ type, placeId, offerId }: { type: SubmissionType; placeId?: string; offerId?: string }) {
  const navigate = useNavigate();
  const mounted = useRef(false);
  const [draft, setDraft] = useState<DraftPayload>({});
  const [uploadPending, setUploadPending] = useState(false);
  const create = useIntent();
  const locked = create.busy || create.uncertain;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || uploadPending) return;
    const body = { type, targetPlaceId: placeId, targetOfferId: offerId, payload: type === 'NEW_PLACE' ? draft : {} };
    void create.run(async (key) => {
      const record = await createSubmission(body, key);
      if (mounted.current) navigate(`/submissions/${record.data.id}`, { replace: true, state: { submission: record } });
    });
  }

  return (
    <form className="grid gap-4" aria-label="Создание черновика" noValidate onSubmit={save}>
      <p className="font-semibold">{submissionTypeLabels[type]}</p>
      {type === 'NEW_PLACE' ? (
        <SubmissionForm type={type} value={draft} onChange={setDraft} disabled={locked} onUploadPendingChange={setUploadPending} />
      ) : (
        <p>Сначала создайте черновик: сервис проверит право на изменение и загрузит данные места и скидки, если она выбрана.</p>
      )}
      <ErrorBox error={create.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={locked || uploadPending}>{type === 'NEW_PLACE' ? 'Сохранить черновик' : 'Создать черновик'}</Button>
      </div>
      {create.uncertain && <IntentRecovery busy={create.busy} retry={create.retry} clear={create.clear} />}
    </form>
  );
}

function IntentRecovery({ busy, retry, clear }: { busy: boolean; retry: () => Promise<void>; clear: () => void }) {
  return (
    <div className="space-y-2">
      <Notice>Результат запроса неизвестен. Можно повторить именно этот запрос или завершить попытку, не меняя отправленные данные.</Notice>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void retry()}>Повторить тот же запрос</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={clear}>Завершить попытку</Button>
      </div>
    </div>
  );
}

function useCursors<Cursor extends string | number>() {
  const [trail, setTrail] = useState<(Cursor | null)[]>([null]);
  return {
    before: trail.at(-1) ?? null,
    hasPrevious: trail.length > 1,
    previous: () => setTrail((items) => items.length > 1 ? items.slice(0, -1) : items),
    next: (cursor: Cursor) => setTrail((items) => [...items, cursor]),
  };
}

function PageButtons({ label, hasNext, hasPrevious, next, previous }: {
  label: string;
  hasNext: boolean;
  hasPrevious: boolean;
  next: () => void;
  previous: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      <Button type="button" variant="outline" disabled={!hasPrevious} onClick={previous}>Назад</Button>
      <Button type="button" variant="outline" disabled={!hasNext} onClick={next}>Далее</Button>
    </div>
  );
}

function SubmissionHistory({ id }: { id: string }) {
  const cursors = useCursors<string>();
  const page = useRead((signal) => listSubmissionHistory(id, cursors.before, signal), `${id}:${cursors.before ?? ''}`);
  const next = page.data?.nextCursor;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">История статусов</h2>
      {page.loading && <Spinner />}
      {Boolean(page.error) && <div className="space-y-2">
        <ErrorBox error={page.error} />
        <Button type="button" variant="outline" onClick={page.reload}>Повторить загрузку истории</Button>
      </div>}
      {page.data && (page.data.items.length ? (
        <ol className="grid gap-2">
          {page.data.items.map((entry) => <li key={entry.id} className="grid gap-1 rounded-md border p-3">
            <p className="font-medium">{entry.fromStatus && `${submissionStatusLabels[entry.fromStatus]} → `}{submissionStatusLabels[entry.toStatus]}</p>
            <time className="text-sm text-muted-foreground" dateTime={entry.occurredAt}>{formatDate(entry.occurredAt)}</time>
            <p className="break-all text-sm">Участник: {entry.actorId ? <code>{entry.actorId}</code> : 'Система'}</p>
            {entry.reason && <p className="break-words whitespace-pre-wrap">Причина: {entry.reason}</p>}
          </li>)}
        </ol>
      ) : <Notice>На этой странице нет событий.</Notice>)}
      <PageButtons label="Страницы истории" hasPrevious={cursors.hasPrevious} hasNext={next != null} previous={cursors.previous} next={() => { if (next != null) cursors.next(next); }} />
    </section>
  );
}

function SubmissionVersions({ id, selected, select, disabled }: {
  id: string;
  selected: number | null;
  select: (version: number | null) => void;
  disabled: boolean;
}) {
  const cursors = useCursors<number>();
  const page = useRead((signal) => listSubmissionVersions(id, cursors.before, signal), `${id}:${cursors.before ?? ''}`);
  const next = page.data?.nextCursor;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">Версии</h2>
      {selected != null && <div>
        <Button type="button" variant="outline" onClick={() => select(null)} disabled={disabled}>Вернуться к текущим данным</Button>
      </div>}
      {page.loading && <Spinner />}
      {Boolean(page.error) && <div className="space-y-2">
        <ErrorBox error={page.error} />
        <Button type="button" variant="outline" onClick={page.reload}>Повторить загрузку версий</Button>
      </div>}
      {page.data && (page.data.items.length ? (
        <ul className="flex flex-wrap gap-2">
          {page.data.items.map((version) => <li key={version.id}>
            <Button type="button" variant={selected === version.versionNo ? 'secondary' : 'outline'} aria-pressed={selected === version.versionNo}
              disabled={disabled} onClick={() => select(version.versionNo)}>Версия №{version.versionNo}</Button>
          </li>)}
        </ul>
      ) : <Notice>На этой странице нет сохранённых версий.</Notice>)}
      <PageButtons label="Страницы версий" hasPrevious={cursors.hasPrevious} hasNext={next != null} previous={cursors.previous} next={() => { if (next != null) cursors.next(next); }} />
    </section>
  );
}

function HistoricalVersion({ id, versionNo }: { id: string; versionNo: number }) {
  const version = useRead((signal) => getSubmissionVersion(id, versionNo, signal), `${id}:${versionNo}`);
  return (
    <section className="grid gap-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Версия №{versionNo} · только чтение</h2>
      {version.loading && <Spinner />}
      {Boolean(version.error) && <div className="space-y-2">
        <ErrorBox error={version.error} />
        <Button type="button" variant="outline" onClick={version.reload}>Повторить загрузку версии</Button>
      </div>}
      {version.data && <>
        <time className="text-sm text-muted-foreground" dateTime={version.data.createdAt}>{formatDate(version.data.createdAt)}</time>
        <SubmissionSnapshot payload={version.data.payload} />
      </>}
    </section>
  );
}

interface Workspace {
  record: SubmissionRecord;
  draft: DraftPayload;
  needsReview?: boolean;
  fresh?: SubmissionRecord;
}

const emptyDraft: DraftPayload = {};

function fromRecord(record: SubmissionRecord): Workspace {
  return { record, draft: record.data.draftPayload ?? emptyDraft };
}

function editable(record: SubmissionRecord) {
  return record.data.status === 'DRAFT' || record.data.status === 'CHANGES_REQUESTED';
}

function acceptRead(current: Workspace | undefined, fresh: SubmissionRecord): Workspace {
  if (!current) return fromRecord(fresh);
  if (current.needsReview || current.fresh) return { ...current, needsReview: false, fresh };
  const unsaved = Object.keys(buildDraftPatch(current.record.data.draftPayload ?? emptyDraft, current.draft)).length > 0;
  if (!unsaved) return fromRecord(fresh);
  return current.record.data.rowVersion === fresh.data.rowVersion ? { ...current, record: fresh } : { ...current, fresh };
}

function SubmissionDetail({ id, seed }: { id: string; seed?: SubmissionRecord }) {
  const { user, hasRole } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | undefined>(() => seed ? fromRecord(seed) : undefined);
  const [historical, setHistorical] = useState<number | null>(null);
  const [sidebarRevision, setSidebarRevision] = useState(0);
  const [receipt, setReceipt] = useState<number>();
  const [uploadPending, setUploadPending] = useState(false);
  const [writeError, setWriteError] = useState<unknown>(null);
  const [writing, setWriting] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const inFlight = useRef(false);
  const read = useRead((signal) => getSubmission(id, signal), id);
  const submit = useIntent();
  const record = workspace?.record;
  const patch = useMemo(() => workspace ? buildDraftPatch(workspace.record.data.draftPayload ?? emptyDraft, workspace.draft) : {}, [workspace]);
  const dirty = Object.keys(patch).length > 0;

  useEffect(() => {
    const fresh = read.data;
    if (!fresh) return;
    setWorkspace((current) => acceptRead(current, fresh));
    setRefreshPending(false);
  }, [read.data]);

  function refresh() {
    setRefreshPending(true);
    read.reload();
    setSidebarRevision((revision) => revision + 1);
  }

  function requireReview() {
    setWorkspace((current) => current && { ...current, needsReview: true, fresh: undefined });
  }

  function reviewFresh(reapply: boolean) {
    const fresh = workspace?.fresh;
    if (!fresh) return;
    const next = fromRecord(fresh);
    setWorkspace(reapply ? { ...next, draft: reapplyDraftPatch(next.draft, patch) } : next);
    setWriteError(null);
    submit.resetError();
  }

  const editing = record && editable(record);
  const pendingMutation = writing || submit.busy || submit.uncertain;
  const reading = read.loading || refreshPending;
  const mustReview = Boolean(workspace?.needsReview || workspace?.fresh);
  const formDisabled = Boolean(reading || mustReview || pendingMutation);
  const writeDisabled = Boolean(formDisabled || uploadPending || !record?.etag || read.error);

  async function writeWithoutKey(action: 'save' | 'cancel') {
    if (!record?.etag || writeDisabled || inFlight.current) return;
    if (action === 'save' ? !editing || !dirty : record.data.status !== 'SUBMITTED') return;
    inFlight.current = true;
    setWriting(true);
    setWriteError(null);
    submit.resetError();
    try {
      if (action === 'save') {
        const saved = await saveSubmission(id, patch, record.etag);
        setWorkspace(fromRecord(saved));
      } else {
        await cancelSubmission(id, record.etag);
        refresh();
      }
    } catch (error) {
      setWriteError(error);
      if (isConflict(error) || isAmbiguous(error)) requireReview();
    } finally {
      inFlight.current = false;
      setWriting(false);
    }
  }

  function sendForReview() {
    const etag = record?.etag;
    if (!etag || writeDisabled || !editing || dirty || inFlight.current) return;
    setWriteError(null);
    setReceipt(undefined);
    void submit.run(async (key) => {
      try {
        const result = await submitSubmission(id, etag, key);
        setReceipt(result.versionNo);
        refresh();
      } catch (error) {
        if (isConflict(error)) requireReview();
        throw error;
      }
    });
  }

  const notReadable = read.error instanceof ApiError && [403, 404].includes(read.error.status);
  const candidate = read.data ?? record;
  const notOwned = candidate && candidate.data.authorId !== user?.id;
  if (notReadable || notOwned || !workspace) {
    return (
      <div className="space-y-2">
        {read.loading && <Spinner />}
        <ErrorBox error={read.error} />
        {notOwned && <p role="alert">Заявка не найдена.</p>}
        {Boolean(read.error) && <Button type="button" variant="outline" onClick={read.reload}>Повторить загрузку заявки</Button>}
      </div>
    );
  }

  const data = workspace.record.data;
  const fresh = workspace.fresh;
  const freshPayload = fresh && (editable(fresh) ? fresh.data.draftPayload : fresh.data.currentVersion?.payload);
  const freshFields = fresh ? buildDraftPatch(data.draftPayload ?? emptyDraft, fresh.data.draftPayload ?? emptyDraft) : {};
  const localArrayChanged = 'offers' in patch || 'attachments' in patch;
  const freshArrayChanged = 'offers' in freshFields || 'attachments' in freshFields;
  const safeReapply = fresh && editable(fresh) && dirty && !(localArrayChanged && freshArrayChanged);
  const failedWrite = writeError || submit.error;
  const conflict = isConflict(failedWrite);
  const unknownWrite = !submit.uncertain && isAmbiguous(writeError);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{submissionTypeLabels[data.type]}</p>
          <p className="break-all font-mono text-xs text-muted-foreground" aria-label="ID заявки">{id}</p>
          <Badge variant="secondary">{submissionStatusLabels[data.status]}</Badge>
        </div>
        <Button type="button" variant="outline" disabled={read.loading || pendingMutation || uploadPending} onClick={refresh}>Обновить</Button>
      </header>
      {read.loading && <Spinner />}
      <ErrorBox error={read.error} />
      <ErrorBox error={failedWrite} />
      {Boolean(read.error) && <div>
        <Button type="button" variant="outline" onClick={refresh} disabled={pendingMutation || uploadPending}>Повторить загрузку заявки</Button>
      </div>}
      {receipt != null && <Notice>Сервис принял запрос на отправку версии №{receipt}.</Notice>}
      {data.latestStatusReason && <p className="break-words whitespace-pre-wrap"><span className="font-medium">Причина последнего перехода: </span>{data.latestStatusReason}</p>}
      {data.status === 'PUBLISHED' && <div className="grid gap-2">
        {Boolean(data.publishedOfferIds?.length) && <div>
          <h2 className="font-semibold">ID опубликованных скидок</h2>
          <ul className="break-all font-mono text-sm">{data.publishedOfferIds?.map((offer) => <li key={offer}>{offer}</li>)}</ul>
        </div>}
        {hasRole('STUDENT') && <div><Button asChild variant="outline"><Link to={`/reports?submissionId=${id}`}>Сообщить о проблеме</Link></Button></div>}
      </div>}
      {conflict && <Notice>Данные заявки изменились или опубликованная карточка устарела. Обновите данные и проверьте их перед новой попыткой.</Notice>}
      {unknownWrite && <Notice>Результат записи неизвестен. Обновите заявку, чтобы узнать, что сохранилось.</Notice>}
      {!workspace.record.etag && (editing || data.status === 'SUBMITTED') && <Notice>Сервер не передал версию заявки. Обновите её перед записью.</Notice>}
      {fresh && <section className="grid gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Свежие данные с сервера</h2>
        <p>Статус: {submissionStatusLabels[fresh.data.status]}</p>
        <p>{dirty ? 'Локальный черновик сохранён ниже без изменений. Сравните его со свежими данными.' : 'Проверьте данные перед новой попыткой.'}</p>
        {freshPayload && <SubmissionSnapshot payload={freshPayload} />}
        {dirty && localArrayChanged && freshArrayChanged && <Notice>Скидки или вложения изменились на сервере. После просмотра перенесите нужные изменения вручную, чтобы не изменить связи вложений.</Notice>}
        <div className="flex flex-wrap gap-2">
          {safeReapply && <Button type="button" onClick={() => reviewFresh(true)}>Перенести мои изменения в свежий черновик</Button>}
          <Button type="button" variant="outline" onClick={() => reviewFresh(false)}>{dirty ? 'Открыть свежие данные без моих изменений' : 'Принять свежие данные'}</Button>
        </div>
      </section>}
      {submit.uncertain && <IntentRecovery
        busy={submit.busy} retry={submit.retry} clear={() => { submit.clear(); requireReview(); }}
      />}
      <SubmissionVersions key={`versions:${sidebarRevision}`} id={id} selected={historical} select={setHistorical} disabled={pendingMutation || uploadPending || mustReview} />
      {historical != null ? <HistoricalVersion key={`${historical}:${sidebarRevision}`} id={id} versionNo={historical} /> : editing ? (
        <form className="grid gap-4" aria-label="Редактирование черновика" noValidate onSubmit={(event) => { event.preventDefault(); void writeWithoutKey('save'); }}>
          <h2 className="text-lg font-semibold">Черновик</h2>
          <SubmissionForm type={data.type} value={workspace.draft} onChange={(draft) => setWorkspace((current) => current && { ...current, draft })}
            disabled={formDisabled} onUploadPendingChange={setUploadPending} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={writeDisabled || !dirty}>Сохранить черновик</Button>
            <Button type="button" variant="outline" disabled={writeDisabled || dirty} onClick={sendForReview}>Отправить на проверку</Button>
          </div>
          {dirty && <p className="text-sm text-muted-foreground">Сохраните изменения перед отправкой на проверку.</p>}
        </form>
      ) : data.currentVersion ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Текущая версия №{data.currentVersion.versionNo}</h2>
          <SubmissionSnapshot payload={data.currentVersion.payload} />
        </section>
      ) : <Notice>Зафиксированной версии пока нет.</Notice>}
      {historical == null && data.status === 'SUBMITTED' && <div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button type="button" variant="destructive" disabled={writeDisabled}>Отменить отправку</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Отменить отправку заявки?</AlertDialogTitle>
              <AlertDialogDescription>Заявка перестанет ожидать проверки, но сохранённая версия останется в истории.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Вернуться</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={writeDisabled} onClick={() => void writeWithoutKey('cancel')}>Отменить заявку</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>}
      <SubmissionHistory key={`history:${sidebarRevision}`} id={id} />
    </div>
  );
}

export function SubmissionPage() {
  const { submissionId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const state = location.state as { submission?: SubmissionRecord } | null;
  const record = state?.submission;
  const placeId = params.get('placeId');
  const offerId = params.get('offerId');
  return (
    <section className="grid gap-5">
      <Link className="w-fit text-sm underline" to="/submissions">Мои заявки</Link>
      <h1 className="text-2xl font-semibold">{submissionId ? 'Заявка' : 'Новая заявка'}</h1>
      {submissionId ? isUuid(submissionId) ? (
        <SubmissionDetail key={submissionId} id={submissionId} seed={record?.data.id === submissionId ? record : undefined} />
      ) : <p role="alert">Некорректный ID заявки.</p> : (
        <NewSubmission key={JSON.stringify([placeId, offerId])} placeId={placeId} offerId={offerId} />
      )}
    </section>
  );
}
