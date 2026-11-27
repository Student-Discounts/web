import { api, apiResponse } from '@/api/http';

export interface MediaAsset {
  id: string;
  status: 'QUARANTINED' | 'PROCESSING' | 'CLEAN' | 'REJECTED';
  rejectionCode?: string | null;
}

const root = '/api/v1/media-assets';
const asset = (id: string) => `${root}/${encodeURIComponent(id)}`;

export function uploadMedia(file: File, key: string) {
  const form = new FormData();
  form.append('file', file);
  return api<MediaAsset>('POST', root, form, { headers: { 'Idempotency-Key': key } });
}

export function getMedia(id: string, signal?: AbortSignal) {
  return api<MediaAsset>('GET', asset(id), undefined, { signal });
}

export async function getMediaPreview(id: string, signal?: AbortSignal) {
  const response = await apiResponse('GET', `${asset(id)}/preview`, undefined, {
    signal, headers: { Accept: 'image/png, application/problem+json' },
  });
  const blob = await response.blob();
  if (blob.type !== 'image/png') throw new Error('Сервер не вернул PNG для предпросмотра.');
  return blob;
}
