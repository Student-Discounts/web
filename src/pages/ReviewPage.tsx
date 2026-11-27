import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sendReviewCommand, type ReviewAction, type ReviewCommandBody } from '@/api/moderation';
import { createCorrection, getComparison, getSubmission, submissionTypeLabels, type DraftPayload } from '@/api/submissions';
import { useAuth } from '@/auth/AuthContext';
import { HistoricalReviewSnapshot, ModerationHistory } from '@/components/moderation-history';
import { ModerationCorrection, type CorrectionSource } from '@/components/moderation-correction';
import { reviewActionLabels, reviewStatusLabel } from '@/components/moderation-labels';
import { useReviewDetail } from '@/components/moderation-review-detail';
import { SubmissionSnapshot } from '@/components/SubmissionSnapshot';
import { ErrorBox, Notice, Spinner } from '@/components/ui';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isConflict, isUuid, useIntent, useRead } from '@/lib/requests';

const decisions: ReviewAction[] = ['APPROVE', 'REJECT', 'CHANGES_REQUESTED', 'REQUEST_EVIDENCE', 'ESCALATE'];

type PendingDecision = { body: ReviewCommandBody; etag: string };

function publicFields({ place, offers }: DraftPayload): DraftPayload {
  return {
    place,
    offers: offers?.map(({ source, ...offer }) => ({ ...offer, source: source ? { type: source.type, url: source.url } : source })),
  };
}

export function ReviewPage() {
  const { submissionId } = useParams();
  if (!submissionId || !isUuid(submissionId)) {
    return <div className="space-y-3"><h1 className="text-3xl font-semibold">Проверка заявки</h1><p role="alert">Некорректный ID заявки.</p><Link className="underline" to="/moderation">К очереди заявок</Link></div>;
  }
  return <ReviewWorkspace key={submissionId} id={submissionId} />;
}

function ReviewWorkspace({ id }: { id: string }) {
  const { user, hasRole } = useAuth();
  const view = useReviewDetail(id);
  const intent = useIntent();
  const [selected, setSelected] = useState<number>();
  const [decision, setDecision] = useState<PendingDecision>();
  const [reason, setReason] = useState('');
  const [correction, setCorrection] = useState<CorrectionSource>();
  const [needsReview, setNeedsReview] = useState(false);
  const [notice, setNotice] = useState<string>();
  const commandTitle = useRef<HTMLHeadingElement>(null);

  const detail = view.response?.data;
  const etag = view.response?.etag;
  const snapshot = detail?.currentSnapshot;
  const historical = selected !== undefined;
  const readSubmission = !historical && !!snapshot;
  const reviewKey = `${id}:${view.revision}:${detail?.versionId ?? ''}:${etag ?? ''}`;
  const submission = useRead(async (signal) => readSubmission ? getSubmission(id, signal) : null, readSubmission ? reviewKey : '');
  const type = submission.data?.data.type;
  const compareNeeded = readSubmission && (type === 'NEW_OFFER' || type === 'CHANGE');
  const comparison = useRead(async (signal) => compareNeeded ? getComparison(id, signal) : null, compareNeeded ? `${reviewKey}:${type}` : '');
  const live = comparison.data?.publicSnapshot;
  const liveVersion = comparison.data?.catalogRowVersion ?? null;
  const hasLiveChangeBase = type === 'CHANGE' && !!live && liveVersion !== null && !comparison.loading && !comparison.error;
  const staleChange = hasLiveChangeBase && snapshot?.baseOfferRowVersion !== liveVersion;
  const projectedVersion = submission.data?.data.currentVersion;
  const sameVersion = !!snapshot && !!projectedVersion && projectedVersion.id === snapshot.versionId
    && projectedVersion.versionNo === snapshot.versionNo;
  const submissionStatus = submission.data?.data.status;
  const matchesSubmission = sameVersion && submissionStatus === 'IN_REVIEW';
  const pending = !!detail?.pendingCommandId || !!view.watch;
  const author = !!user && detail?.authorId === user.id;
  const senior = hasRole('SENIOR_MODERATOR');
  const locked = intent.busy || intent.uncertain;
  const canReview = !!detail && !!user && !!detail.authorId && !author && !historical && !!etag && !!snapshot
    && snapshot.versionId === detail.versionId && snapshot.versionNo === detail.versionNo && snapshot.versionNo > 0
    && !pending && !view.loading && !view.error && !view.timedOut && !needsReview && !view.outcome?.requiresRefresh
    && (!detail.escalated || senior);
  const canClaim = canReview && !detail.reviewerId && (detail.status === 'PENDING_REVIEW' || detail.status === 'IN_REVIEW');
  const canDecide = canReview && detail.status === 'IN_REVIEW' && detail.reviewerId === user.id;
  const canReopen = canReview && senior && detail.status === 'SUSPENDED';
  const canApprove = canDecide && !!type && matchesSubmission && (type !== 'CHANGE' || (hasLiveChangeBase && !staleChange));
  const canCorrect = canDecide && !!type && matchesSubmission && (type !== 'CHANGE' || hasLiveChangeBase);
  const correctionValid = !!correction && canCorrect && correction.type === type && correction.reviewEtag === etag
    && correction.reviewRevision === view.revision && correction.snapshot.versionId === snapshot?.versionId
    && (correction.type !== 'CHANGE' || correction.catalogRowVersion === liveVersion);

  function refresh() {
    if (locked) return;
    setNeedsReview(false);
    setDecision(undefined);
    setNotice(undefined);
    intent.resetError();
    view.reload(view.watch);
  }

  async function mutate(request: (key: string) => Promise<void>) {
    setNotice(undefined);
    await intent.run(async (key) => {
      try {
        await request(key);
      } catch (error) {
        if (isConflict(error)) setNeedsReview(true);
        throw error;
      }
    });
  }

  function available(action: ReviewAction) {
    if (locked || correction) return false;
    switch (action) {
      case 'CLAIM': return canClaim;
      case 'APPROVE': return canApprove;
      case 'REOPEN': return canReopen;
      default: return canDecide;
    }
  }

  function issue({ body, etag: reviewedEtag }: PendingDecision) {
    if (!available(body.action) || reviewedEtag !== etag || !snapshot || body.versionId !== snapshot.versionId || body.versionNo !== snapshot.versionNo) return;
    void mutate(async (key) => {
      const receipt = await sendReviewCommand(id, body, reviewedEtag, key);
      // Reclaiming an already IN_REVIEW correction may be confirmed locally,
      // without a pending command record in the review history.
      view.reload(receipt.state === 'PENDING' ? { kind: 'command', id: receipt.commandId } : undefined);
    });
    setDecision(undefined);
  }

  function choose(action: ReviewAction) {
    if (!available(action) || !snapshot || !etag) return;
    const command = { body: { action, versionId: snapshot.versionId, versionNo: snapshot.versionNo }, etag };
    if (action === 'CLAIM') issue(command);
    else {
      intent.resetError();
      setReason('');
      setDecision(command);
    }
  }

  function openCorrection() {
    if (locked || !canCorrect || !snapshot || !type || !etag) return;
    intent.resetError();
    setCorrection({ type, snapshot, catalogRowVersion: liveVersion, reviewRevision: view.revision, reviewEtag: etag });
  }

  function saveCorrection(payload: DraftPayload, submissionEtag: string) {
    if (locked || !correctionValid || !correction) return;
    const body = {
      reviewedVersionId: correction.snapshot.versionId,
      payload: { ...payload, attachments: correction.snapshot.payload.attachments },
      ...(correction.type === 'CHANGE' && correction.catalogRowVersion !== null
        ? { expectedCatalogRowVersion: correction.catalogRowVersion } : {}),
    };
    void mutate(async (key) => {
      const receipt = await createCorrection(id, body, submissionEtag, key);
      setCorrection(undefined);
      if (receipt.status === 200) {
        setNotice('В исправлении нет изменений. Новая версия не создана.');
        view.reload();
      } else {
        view.reload({ kind: 'version', id: receipt.data.id, versionNo: receipt.data.versionNo });
      }
    });
  }

  const trimmedReason = reason.trim();
  const validReason = !!decision && trimmedReason.length <= 2000 && (decision.body.action === 'APPROVE' || !!trimmedReason);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link to="/moderation" className="text-sm underline underline-offset-4">К очереди заявок</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-3xl font-semibold">Проверка заявки</h1>
            <p className="break-all text-sm text-muted-foreground">{id}</p>
          </div>
          <Button variant="outline" disabled={view.loading || locked} onClick={refresh}>Обновить</Button>
        </div>
        {detail && <div className="flex flex-wrap gap-2">
          {type && <Badge variant="secondary">{submissionTypeLabels[type]}</Badge>}
          <Badge variant="outline">{reviewStatusLabel(detail.status === 'APPROVED' && sameVersion && submissionStatus === 'PUBLISHED' ? 'PUBLISHED' : detail.status)}</Badge>
          {detail.escalated && <Badge variant="secondary">Эскалирована</Badge>}
        </div>}
      </header>

      {view.loading && <Spinner />}
      {!view.loading && <ErrorBox error={view.error} />}
      {!view.loading && view.timedOut && <Notice>Сервис не подтвердил состояние за 60 секунд. Нажмите «Обновить», чтобы проверить снова.</Notice>}
      {!view.loading && view.outcome && (view.outcome.failed ? <p role="alert" className="text-sm text-destructive">{view.outcome.text}</p> : <Notice>{view.outcome.text}</Notice>)}
      {notice && <Notice>{notice}</Notice>}
      {pending && <Notice>{view.watch?.kind === 'version' ? `Ожидается исправленная версия №${view.watch.versionNo}.` : 'Ожидается подтверждение команды.'} Действия пока недоступны.</Notice>}
      <ErrorBox error={intent.error} />
      {needsReview && <Notice>Возник конфликт. Обновите проверку и заново сверьте текущий снимок перед следующим действием.</Notice>}
      {intent.uncertain && <div className="space-y-2">
        <Notice>Результат запроса неизвестен. Повтор использует прежнюю версию, ETag и ключ запроса.</Notice>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={intent.busy} onClick={() => void intent.retry()}>Повторить тот же запрос</Button>
          <Button variant="outline" disabled={intent.busy} onClick={() => { intent.clear(); view.reload(view.watch); }}>Снять попытку и обновить</Button>
        </div>
      </div>}

      {detail && <>
        <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0"><dt className="text-muted-foreground">Автор заявки</dt><dd className="break-all">{detail.authorId ?? '—'}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">Проверяющий</dt><dd className="break-all">{detail.reviewerId ?? 'Не назначен'}</dd></div>
          <div><dt className="text-muted-foreground">Текущая версия</dt><dd>{detail.versionNo ?? '—'}</dd></div>
        </dl>
        {detail.riskAssessmentAvailability === 'NOT_PROVIDED' && <p className="text-sm text-muted-foreground">Оценка риска недоступна</p>}

        {selected !== undefined ? <HistoricalReviewSnapshot id={id} versionNo={selected} onClose={() => setSelected(undefined)} /> : (
          <>
            <div className={compareNeeded ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}>
              <section className="min-w-0 space-y-3" aria-labelledby="review-snapshot-title">
                <h2 id="review-snapshot-title" className="text-xl font-semibold">{snapshot ? `Текущий снимок версии №${snapshot.versionNo}` : 'Текущий снимок'}</h2>
                {snapshot ? <SubmissionSnapshot key={snapshot.versionId} payload={snapshot.payload} /> : <p>Неизменяемый снимок пока не получен.</p>}
              </section>
              {compareNeeded && <section className="min-w-0 space-y-3" aria-labelledby="live-snapshot-title">
                <h2 id="live-snapshot-title" className="text-xl font-semibold">Текущая опубликованная карточка</h2>
                {comparison.loading ? <Spinner /> : comparison.error ? (
                  <><ErrorBox error={comparison.error} /><Button variant="outline" onClick={comparison.reload} disabled={locked}>Повторить сравнение</Button></>
                ) : live ? (
                  <>
                    {type === 'CHANGE' && liveVersion !== null && <p className="text-sm text-muted-foreground">Редакция опубликованной скидки: {liveVersion} · База снимка: {snapshot?.baseOfferRowVersion ?? 'нет'}</p>}
                    <SubmissionSnapshot key={`${id}:${liveVersion ?? ''}`} payload={publicFields(live)} />
                    {type === 'CHANGE' && liveVersion === null && <Notice>Редакция опубликованной скидки отсутствует.</Notice>}
                    {staleChange && <Notice>Редакция скидки изменилась. Одобрить можно только новую версию после её проверки. Сверьте опубликованную карточку перед исправлением.</Notice>}
                    <Button variant="outline" onClick={comparison.reload} disabled={locked}>Обновить сравнение</Button>
                  </>
                ) : <><p>Нет опубликованной карточки для сравнения.</p><Button variant="outline" onClick={comparison.reload} disabled={locked}>Обновить сравнение</Button></>}
              </section>}
            </div>
            {snapshot && submission.loading && <Spinner />}
            {Boolean(submission.error) && <div className="space-y-2"><ErrorBox error={submission.error} /><Button variant="outline" onClick={submission.reload} disabled={locked}>Повторить загрузку сведений о заявке</Button></div>}
            {canDecide && type && !matchesSubmission && <Notice>Сервис заявок не подтвердил текущую версию на рассмотрении. Обновите и сверьте снимок перед одобрением или исправлением.</Notice>}
            {canDecide && type === 'CHANGE' && !hasLiveChangeBase && <Notice>Одобрение и исправление недоступны, пока не загружена база опубликованной скидки.</Notice>}

            <Card>
              <CardHeader><CardTitle><h2 ref={commandTitle} tabIndex={-1}>Действия с текущей версией</h2></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!etag && <p>ETag проверки отсутствует. Обновите данные перед изменением.</p>}
                {author && <p>Нельзя проверять собственную заявку.</p>}
                {detail.escalated && !senior && <p>Эту заявку может проверять только старший модератор.</p>}
                {!canClaim && !canDecide && !canReopen && !author && !(detail.escalated && !senior) && <p className="text-sm text-muted-foreground">Сейчас нет доступных действий для этого назначения или статуса.</p>}
                <div className="flex flex-wrap gap-2">
                  {canClaim && <Button disabled={!available('CLAIM')} onClick={() => choose('CLAIM')}>{reviewActionLabels.CLAIM}</Button>}
                  {canDecide && decisions.map((action) => <Button key={action} variant={action === 'APPROVE' ? 'default' : 'outline'} disabled={!available(action)} onClick={() => choose(action)}>{reviewActionLabels[action]}</Button>)}
                  {canDecide && <Button variant="outline" disabled={locked || !canCorrect || !!correction} onClick={openCorrection}>Создать исправленную версию</Button>}
                  {canReopen && <Button variant="outline" disabled={!available('REOPEN')} onClick={() => choose('REOPEN')}>{reviewActionLabels.REOPEN}</Button>}
                </div>
              </CardContent>
            </Card>
            {correction && <ModerationCorrection id={id} source={correction} valid={correctionValid} disabled={locked} onClose={() => { setCorrection(undefined); intent.resetError(); }} onSave={saveCorrection} />}
          </>
        )}
        <ModerationHistory id={id} versionsKey={`${id}:${view.revision}:${detail.versionId ?? ''}`} auditKey={reviewKey} commands={detail.commands} selected={selected} onSelect={setSelected} disabled={locked || !!correction} />
      </>}

      <AlertDialog open={!!decision} onOpenChange={(open) => { if (!open) setDecision(undefined); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); commandTitle.current?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{decision && reviewActionLabels[decision.body.action]}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">Действие будет применено к версии №{decision?.body.versionNo} ({decision?.body.versionId}).</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="review-reason">Причина {decision?.body.action === 'APPROVE' ? '(необязательно)' : '(обязательно)'}</Label>
            <Textarea id="review-reason" value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={!decision || !validReason || !available(decision.body.action)} onClick={() => {
              if (decision && validReason) issue({ ...decision, body: { ...decision.body, reason: trimmedReason || undefined } });
            }}>Подтвердить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
