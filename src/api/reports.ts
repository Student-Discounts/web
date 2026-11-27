import { api } from '@/api/http';
import { pageSize, query } from '@/lib/requests';

export const reportCategoryNames = {
  OUTDATED: 'Информация устарела',
  CLOSED: 'Место закрылось',
  DISCOUNT_STOPPED: 'Скидка больше не действует',
  MISLEADING: 'Вводит в заблуждение',
  ABUSE: 'Злоупотребление',
  OTHER: 'Другое',
};
export type ReportCategory = keyof typeof reportCategoryNames;

export const reportStateNames = {
  OPEN: 'Открыта',
  TRIAGED: 'Рассматривается',
  ESCALATED: 'Передана старшему модератору',
  RESOLVED: 'Рассмотрена',
};

export type ReportAction = 'TRIAGE' | 'ESCALATE' | 'RESOLVE';

export interface Report {
  id: string;
  reporterId: string;
  submissionId: string;
  category: ReportCategory;
  description: string;
  state: keyof typeof reportStateNames;
  rowVersion: number;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

const ownPath = '/api/v1/reports';
const queuePath = '/api/v1/moderation/reports';

export const reportsApi = {
  own(before: string | undefined, signal: AbortSignal) {
    return api<Report[]>('GET', ownPath + query({ limit: pageSize, before }), undefined, { signal });
  },
  create(body: { submissionId: string; category: ReportCategory; description: string }, key: string) {
    return api<Report>('POST', ownPath, body, { headers: { 'Idempotency-Key': key } });
  },
  queue(before: string | undefined, signal: AbortSignal) {
    return api<Report[]>('GET', queuePath + query({ limit: pageSize, before }), undefined, { signal });
  },
  act(report: Pick<Report, 'id' | 'rowVersion'>, body: { action: ReportAction; reason: string }, key: string) {
    return api<Report>('POST', `${queuePath}/${report.id}/actions`, body, {
      headers: { 'If-Match': `"${report.rowVersion}"`, 'Idempotency-Key': key },
    });
  },
};
