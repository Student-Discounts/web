import { useEffect, useState } from 'react';
import { ApiError } from '@/api/http';
import { getMedia, getMediaPreview, type MediaAsset } from '@/api/media';
import type { AttachmentReference } from '@/api/submissions';
import { Button } from '@/components/ui/button';
import { ErrorBox, Notice, Spinner } from '@/components/ui';

const labels: Record<MediaAsset['status'], string> = {
  QUARANTINED: 'Ожидает обработки',
  PROCESSING: 'Обрабатывается',
  CLEAN: 'Превью готово',
  REJECTED: 'Файл отклонён',
};

function notFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

function Preview({ id, close }: { id: string; close: () => void }) {
  const [result, setResult] = useState<{ url?: string; error?: unknown }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void getMediaPreview(id, controller.signal).then((blob) => {
      if (!controller.signal.aborted) {
        url = URL.createObjectURL(blob);
        setResult({ url });
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ error });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, attempt]);

  return (
    <div className="space-y-2">
      {!result && <Spinner />}
      {result?.url && <img src={result.url} className="max-h-96 max-w-full rounded-md object-contain" alt="Превью вложения" />}
      {notFound(result?.error) ? <Notice>Предпросмотр недоступен для этой учётной записи.</Notice> : <ErrorBox error={result?.error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={close}>Закрыть предпросмотр</Button>
        {Boolean(result?.error) && !notFound(result?.error) && (
          <Button type="button" size="sm" variant="outline" onClick={() => { setResult(undefined); setAttempt((n) => n + 1); }}>Повторить предпросмотр</Button>
        )}
      </div>
    </div>
  );
}

interface PrivateAttachmentProps {
  reference: AttachmentReference;
  onRemove?: () => void;
  disabled?: boolean;
}

function Attachment({ reference, onRemove, disabled }: PrivateAttachmentProps) {
  const id = reference.mediaAssetId;
  const [asset, setAsset] = useState<MediaAsset>();
  const [error, setError] = useState<unknown>(null);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let next: number | undefined;
    const deadline = window.setTimeout(() => {
      controller.abort();
      clearTimeout(next);
      setPaused(true);
    }, 60_000);

    async function check() {
      try {
        const data = await getMedia(id, controller.signal);
        if (controller.signal.aborted) return;
        setAsset(data);
        if (data.status === 'QUARANTINED' || data.status === 'PROCESSING') {
          next = window.setTimeout(() => { void check(); }, 2_000);
        } else {
          clearTimeout(deadline);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          clearTimeout(deadline);
          setError(failure);
        }
      }
    }

    void check();
    return () => {
      controller.abort();
      clearTimeout(next);
      clearTimeout(deadline);
    };
  }, [id, attempt]);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="font-medium">
        {reference.purpose === 'PROOF' ? 'Подтверждение' : 'Фото'} · {reference.offerIndex == null ? 'Для всех скидок' : `Скидка №${reference.offerIndex + 1}`}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">{id}</p>
      <div role="status" className="text-sm">
        {asset ? labels[asset.status] : !error && !paused && 'Проверяем статус файла…'}
        {asset?.status === 'REJECTED' && asset.rejectionCode && <>: <code>{asset.rejectionCode}</code></>}
      </div>
      {notFound(error) ? <Notice>Предпросмотр недоступен для этой учётной записи.</Notice> : <ErrorBox error={error} />}
      {paused && <Notice>Автоматическая проверка остановлена. Статус можно проверить снова.</Notice>}
      <div className="flex flex-wrap gap-2">
        {asset?.status === 'CLEAN' && !preview && (
          <Button type="button" size="sm" variant="outline" onClick={() => setPreview(true)}>Открыть предпросмотр</Button>
        )}
        {(paused || Boolean(error)) && (
          <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); setPaused(false); setAttempt((n) => n + 1); }}>
            Проверить статус
          </Button>
        )}
        {onRemove && (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onRemove}>Удалить вложение</Button>
        )}
      </div>
      {preview && <Preview id={id} close={() => setPreview(false)} />}
    </div>
  );
}

export function PrivateAttachment(props: PrivateAttachmentProps) {
  return <Attachment key={props.reference.mediaAssetId} {...props} />;
}
