import { ApiError } from './http';
import type { IdentityAction, Role } from './auth';

/** Тексты для кодов ошибок auth; для остальных показывается detail из ответа. */
const ERROR_MESSAGES: Record<string, string> = {
  validation_failed: 'Проверьте заполнение полей',
  unauthorized: 'Нужно войти заново',
  invalid_credentials: 'Неверный email или пароль',
  invalid_refresh_token: 'Сессия завершена, войдите заново',
  account_blocked: 'Аккаунт заблокирован',
  access_denied: 'Недостаточно прав для этого действия',
  self_management_forbidden: 'Нельзя менять собственные роли, блокировать себя или завершать свои сессии здесь',
  role_not_manageable: 'Эту роль нельзя назначить через интерфейс',
  target_not_manageable: 'Старшего модератора нельзя заблокировать или завершить его сессии',
  email_already_registered: 'Этот email уже зарегистрирован',
  session_not_found: 'Сессия не найдена',
  user_not_found: 'Пользователь не найден',
};

const STATUS_MESSAGES: Record<number, string> = {
  0: 'Шлюз недоступен. Запущены ли Kong и сервисы?',
  404: 'Не найдено',
  413: 'Слишком большой запрос',
  429: 'Слишком много попыток, подождите минуту',
  502: 'Сервис за шлюзом не запущен',
  503: 'Сервис за шлюзом недоступен',
};

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Неизвестная ошибка';
  const { code } = error;
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return error.problem.detail ?? STATUS_MESSAGES[error.status] ?? error.message;
}

export const ROLE_NAMES: Record<Role, string> = {
  STUDENT: 'Студент',
  ORG_REPRESENTATIVE: 'Представитель организации',
  MODERATOR: 'Модератор',
  SENIOR_MODERATOR: 'Старший модератор',
};

export const ACTION_NAMES: Record<IdentityAction, string> = {
  ROLE_GRANTED: 'Назначена роль',
  ROLE_REVOKED: 'Снята роль',
  ACCOUNT_BLOCKED: 'Аккаунт заблокирован',
  ACCOUNT_UNBLOCKED: 'Аккаунт разблокирован',
  SESSIONS_REVOKED: 'Сессии завершены',
};

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });

export function formatDate(value: string | null | undefined): string {
  return value ? dateFormat.format(new Date(value)) : '—';
}
