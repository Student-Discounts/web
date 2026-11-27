import type { CommandState, ReviewAction } from '@/api/moderation';
import { submissionStatusLabels } from '@/api/submissions';

export function reviewStatusLabel(status: string): string {
  return Object.hasOwn(submissionStatusLabels, status)
    ? submissionStatusLabels[status as keyof typeof submissionStatusLabels]
    : status;
}

export const reviewActionLabels: Record<ReviewAction, string> = {
  CLAIM: 'Взять в работу',
  APPROVE: 'Одобрить',
  REJECT: 'Отклонить',
  CHANGES_REQUESTED: 'Вернуть на доработку',
  REQUEST_EVIDENCE: 'Запросить доказательства',
  ESCALATE: 'Передать старшему модератору',
  REOPEN: 'Возобновить проверку',
};

export const reviewCommandLabels: Record<CommandState, string> = {
  PENDING: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждена',
  REJECTED: 'Не выполнена: отклонена',
  SUPERSEDED: 'Не выполнена: замещена',
};
