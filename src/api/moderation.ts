import { api, apiResponse } from '@/api/http';
import type { DraftPayload } from '@/api/submissions';
import { pageSize, query } from '@/lib/requests';

export interface ReviewQueueItem {
  submissionId: string;
  versionId: string | null;
  versionNo: number | null;
  status: string;
  reviewerId: string | null;
  pendingCommandId: string | null;
  escalated: boolean;
}

export interface ReviewSnapshot {
  versionId: string;
  versionNo: number;
  payload: DraftPayload;
  baseOfferRowVersion: number | null;
  authorId: string;
  occurredAt: string;
}

export type ReviewAction = 'CLAIM' | 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED' | 'REQUEST_EVIDENCE' | 'ESCALATE' | 'REOPEN';
export type CommandState = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'SUPERSEDED';

export interface ReviewCommand {
  id: string;
  state: CommandState;
  action: ReviewAction;
  versionId: string;
  versionNo: number;
  actorId: string;
  reason: string | null;
  failure: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReviewDetail extends ReviewQueueItem {
  authorId: string | null;
  currentSnapshot: ReviewSnapshot | null;
  commands: ReviewCommand[];
  riskAssessmentAvailability: 'NOT_PROVIDED';
}

export interface ReviewRecord {
  data: ReviewDetail;
  etag: string | null;
}

export interface ReviewDiff {
  path: string;
  before: unknown;
  after: unknown;
}

export interface ReviewAudit {
  id: string;
  action: string;
  actorId: string | null;
  detail: Record<string, unknown>;
  correlationId: string;
  occurredAt: string;
}

export interface ReviewCommandBody {
  action: ReviewAction;
  versionId: string;
  versionNo: number;
  reason?: string;
}

interface ReviewCommandReceipt {
  commandId: string;
  state: 'PENDING' | 'CONFIRMED';
}

const review = (id: string) => `/api/v1/moderation/reviews/${encodeURIComponent(id)}`;

export function getReviewQueue(escalatedOnly: boolean, before?: string, signal?: AbortSignal) {
  return api<ReviewQueueItem[]>('GET', `/api/v1/moderation/queue${query({ limit: pageSize, before, escalatedOnly })}`, undefined, { signal });
}

export async function getReview(id: string, signal?: AbortSignal): Promise<ReviewRecord> {
  const response = await apiResponse('GET', review(id), undefined, { signal });
  return { data: await response.json(), etag: response.headers.get('ETag') };
}

export function getReviewVersions(id: string, before?: number, signal?: AbortSignal) {
  return api<ReviewSnapshot[]>('GET', `${review(id)}/versions${query({ limit: pageSize, before })}`, undefined, { signal });
}

export function getReviewVersion(id: string, versionNo: number, signal?: AbortSignal) {
  return api<ReviewSnapshot>('GET', `${review(id)}/versions/${versionNo}`, undefined, { signal });
}

export function getReviewDiff(id: string, versionNo: number, signal?: AbortSignal) {
  return api<ReviewDiff[]>('GET', `${review(id)}/comparison${query({ versionNo })}`, undefined, { signal });
}

export function getReviewHistory(id: string, before?: string, signal?: AbortSignal) {
  return api<ReviewAudit[]>('GET', `${review(id)}/history${query({ limit: pageSize, before })}`, undefined, { signal });
}

export function sendReviewCommand(id: string, body: ReviewCommandBody, etag: string, key: string) {
  return api<ReviewCommandReceipt>('POST', `${review(id)}/commands`, body, { headers: { 'If-Match': etag, 'Idempotency-Key': key } });
}
