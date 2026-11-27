import { useState, type FormEvent } from 'react';
import { getSubmission, type DraftPayload, type SubmissionType } from '@/api/submissions';
import type { ReviewSnapshot } from '@/api/moderation';
import { SubmissionForm } from '@/components/SubmissionForm';
import { ErrorBox, Notice, Spinner } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRead } from '@/lib/requests';

export interface CorrectionSource {
  type: SubmissionType;
  snapshot: ReviewSnapshot;
  catalogRowVersion: number | null;
  reviewRevision: number;
  reviewEtag: string;
}

export function ModerationCorrection({ id, source, valid, disabled, onClose, onSave }: {
  id: string;
  source: CorrectionSource;
  valid: boolean;
  disabled: boolean;
  onClose: () => void;
  onSave: (payload: DraftPayload, etag: string) => void;
}) {
  const [payload, setPayload] = useState(source.snapshot.payload);
  const [reviewedNewBase, setReviewedNewBase] = useState(false);
  const submission = useRead((signal) => getSubmission(id, signal), id);
  const record = submission.data;
  const version = record?.data.currentVersion;
  const sameReview = record?.data.status === 'IN_REVIEW' && !!version
    && version.id === source.snapshot.versionId && version.versionNo === source.snapshot.versionNo;
  const baseChanged = source.type === 'CHANGE' && source.catalogRowVersion !== source.snapshot.baseOfferRowVersion;
  const canSend = valid && !disabled && sameReview && !!record?.etag && (!baseChanged || reviewedNewBase);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend && record?.etag) onSave(payload, record.etag);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Создать исправленную версию на основе №{source.snapshot.versionNo}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Вложения автора и их привязка сохраняются. Исправленный снимок придётся взять в работу заново.</p>
        {!valid && <Notice>Данные проверки или сравнения изменились либо ещё загружаются. Закройте форму и заново проверьте текущий снимок и базу перед сохранением.</Notice>}
        {submission.loading && <Spinner />}
        {Boolean(submission.error) && <div className="space-y-2"><ErrorBox error={submission.error} /><Button variant="outline" onClick={submission.reload} disabled={disabled || !valid}>Повторить загрузку</Button></div>}
        {record && (!sameReview || !record.etag) && <Notice>Сервис заявок не подтвердил эту версию, её статус или ETag. Обновите проверку и сверьте версию перед исправлением.</Notice>}
        {record && sameReview && record.etag && (
          <form className="space-y-4" onSubmit={save}>
            {baseChanged && <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring" checked={reviewedNewBase} disabled={disabled || !valid} onChange={(event) => setReviewedNewBase(event.target.checked)} />
              Я сверил текущую опубликованную карточку редакции {source.catalogRowVersion} со снимком версии №{source.snapshot.versionNo} и использую эту редакцию для новой версии.
            </label>}
            <SubmissionForm value={payload} onChange={setPayload} type={source.type} correction disabled={disabled || !valid} />
            <Button type="submit" disabled={!canSend}>Сохранить исправленную версию</Button>
          </form>
        )}
        <Button type="button" variant="outline" onClick={onClose} disabled={disabled}>Закрыть форму</Button>
      </CardContent>
    </Card>
  );
}
