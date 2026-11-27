import { api, apiResponse } from '@/api/http';
import { pageSize, query } from '@/lib/requests';

export const submissionTypeLabels = {
  NEW_PLACE: 'Новое место',
  NEW_OFFER: 'Новая скидка',
  CHANGE: 'Изменение скидки',
};
export type SubmissionType = keyof typeof submissionTypeLabels;

export const submissionStatusLabels = {
  DRAFT: 'Черновик',
  SUBMITTED: 'Отправлена на проверку',
  VALIDATING: 'Проходит проверку данных',
  PENDING_REVIEW: 'Ожидает модератора',
  IN_REVIEW: 'На рассмотрении',
  CHANGES_REQUESTED: 'Требуются изменения',
  APPROVED: 'Одобрена, ожидает публикации',
  REJECTED: 'Отклонена',
  CANCELLED: 'Отменена',
  PUBLISHED: 'Опубликована',
  SUSPENDED: 'Приостановлена',
  ARCHIVED: 'В архиве',
};
export type SubmissionStatus = keyof typeof submissionStatusLabels;

export const discountLabels = {
  PERCENT: 'Процент',
  FIXED_AMOUNT: 'Фиксированная сумма',
  SPECIAL_PRICE: 'Специальная цена',
  FREE_ITEM: 'Бесплатный товар',
  OTHER: 'Другое',
};
export const sourceLabels = {
  WEBSITE: 'Сайт',
  SOCIAL_MEDIA: 'Социальная сеть',
  ORGANIZATION: 'Организация',
  PERSONAL_VISIT: 'Личное посещение',
  OTHER: 'Другое',
};

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface DraftPlace {
  id?: string | null;
  name?: string | null;
  city?: string | null;
  addressLine?: string | null;
  categoryCode?: string | null;
  location?: Partial<Coordinates> | null;
}

export interface ScheduleInterval {
  dayOfWeek: number;
  timeFrom: string;
  timeUntil: string;
}

export interface DraftOffer {
  id?: string | null;
  conditions?: string | null;
  discountType?: keyof typeof discountLabels | null;
  discountValue?: number | null;
  source?: {
    type?: keyof typeof sourceLabels | null;
    url?: string | null;
    note?: string | null;
  } | null;
  validFrom?: string | null;
  validUntil?: string | null;
  schedule?: ScheduleInterval[] | null;
}

export interface AttachmentReference {
  mediaAssetId: string;
  purpose: 'PHOTO' | 'PROOF';
  offerIndex?: number | null;
}

export interface DraftPayload {
  place?: DraftPlace | null;
  offers?: DraftOffer[] | null;
  attachments?: AttachmentReference[] | null;
}

export interface SubmissionVersion {
  id: string;
  submissionId: string;
  versionNo: number;
  previousVersionId?: string | null;
  payload: DraftPayload;
  payloadSchemaVersion: number;
  contentSha256: string;
  baseOfferRowVersion?: number | null;
  createdBy: string;
  createdAt: string;
  resolvedTimezone?: string | null;
}

interface SubmissionMetadata {
  id: string;
  type: SubmissionType;
  status: SubmissionStatus;
  authorId: string;
  rowVersion: number;
  targetPlaceId?: string | null;
  targetOfferId?: string | null;
  publishedOfferIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Submission extends SubmissionMetadata {
  draftPayload?: DraftPayload | null;
  currentVersion: SubmissionVersion | null;
  latestStatusReason?: string | null;
}

export interface SubmissionRecord {
  data: Submission;
  etag: string | null;
}

interface SubmissionHistory {
  id: string;
  submissionId: string;
  versionId?: string | null;
  fromStatus?: SubmissionStatus | null;
  toStatus: SubmissionStatus;
  actorId?: string | null;
  reason?: string | null;
  correlationId?: string | null;
  occurredAt: string;
}

interface CursorPage<Item, Cursor> {
  items: Item[];
  nextCursor: Cursor | null;
}

interface SubmissionComparison {
  currentSnapshot: DraftPayload;
  publicSnapshot: DraftPayload | null;
  catalogRowVersion: number | null;
  changedFields: string[];
}

interface SubmitReceipt {
  submissionId: string;
  status: SubmissionStatus;
  versionId: string;
  versionNo: number;
  contentSha256: string;
  rowVersion: number;
}

interface CreateDraft {
  type: SubmissionType;
  targetPlaceId?: string;
  targetOfferId?: string;
  payload: DraftPayload;
}

interface Correction {
  reviewedVersionId: string;
  payload: DraftPayload;
  expectedCatalogRowVersion?: number;
}

type JsonObject = Record<string, unknown>;

const root = '/api/v1/submissions';
const submission = (id: string) => `${root}/${encodeURIComponent(id)}`;
const pageQuery = (before: string | number | null) => query({ limit: pageSize, before });
const keyed = (key: string) => ({ 'Idempotency-Key': key });
const matched = (etag: string) => ({ 'If-Match': etag });

export function withoutTargetIds(payload: DraftPayload): DraftPayload {
  const { place, offers, ...rest } = payload;
  const { id: ignored, ...placeFields } = place ?? {};
  return {
    ...rest,
    place: place == null ? place : placeFields,
    offers: offers?.map(({ id: ignored, ...offerFields }) => offerFields) ?? offers,
  };
}

async function submissionRecord(response: Response): Promise<SubmissionRecord> {
  return { data: await response.json() as Submission, etag: response.headers.get('ETag') };
}

export async function getSubmission(id: string, signal?: AbortSignal): Promise<SubmissionRecord> {
  return submissionRecord(await apiResponse('GET', submission(id), undefined, { signal }));
}

export function listSubmissions(before: string | null, signal?: AbortSignal) {
  return api<CursorPage<SubmissionMetadata, string>>('GET', root + pageQuery(before), undefined, { signal });
}

export function listSubmissionVersions(id: string, before: number | null, signal?: AbortSignal) {
  return api<CursorPage<SubmissionVersion, number>>('GET', `${submission(id)}/versions${pageQuery(before)}`, undefined, { signal });
}

export function getSubmissionVersion(id: string, versionNo: number, signal?: AbortSignal) {
  return api<SubmissionVersion>('GET', `${submission(id)}/versions/${versionNo}`, undefined, { signal });
}

export function listSubmissionHistory(id: string, before: string | null, signal?: AbortSignal) {
  return api<CursorPage<SubmissionHistory, string>>('GET', `${submission(id)}/history${pageQuery(before)}`, undefined, { signal });
}

export function getComparison(id: string, signal?: AbortSignal) {
  return api<SubmissionComparison>('GET', `${submission(id)}/comparison`, undefined, { signal });
}

export async function createSubmission(body: CreateDraft, key: string): Promise<SubmissionRecord> {
  return submissionRecord(await apiResponse('POST', root, { ...body, payload: withoutTargetIds(body.payload) }, { headers: keyed(key) }));
}

export async function saveSubmission(id: string, patch: JsonObject, etag: string): Promise<SubmissionRecord> {
  return submissionRecord(await apiResponse('PATCH', submission(id), patch, {
    headers: { ...matched(etag), 'Content-Type': 'application/merge-patch+json' },
  }));
}

export function submitSubmission(id: string, etag: string, key: string) {
  return api<SubmitReceipt>('POST', `${submission(id)}/submit`, undefined, { headers: { ...matched(etag), ...keyed(key) } });
}

export async function cancelSubmission(id: string, etag: string): Promise<void> {
  await apiResponse('POST', `${submission(id)}/cancel`, undefined, { headers: matched(etag) });
}

export async function createCorrection(id: string, body: Correction, etag: string, key: string) {
  const response = await apiResponse('POST', `${submission(id)}/versions`, { ...body, payload: withoutTargetIds(body.payload) }, {
    headers: { ...matched(etag), ...keyed(key) },
  });
  return { data: await response.json() as SubmissionVersion, status: response.status };
}

export function getLocationSuggestions(city: string, addressLine: string, signal?: AbortSignal) {
  return api<{ candidates: { location: Coordinates; timezone: string }[] }>(
    'GET', `/api/v1/location-suggestions${query({ city, addressLine })}`, undefined, { signal },
  );
}
