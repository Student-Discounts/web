import { ApiError } from '../api/http';
import { errorMessage } from '../api/messages';

/** Ошибка API: текст, ошибки по полям и идентификатор запроса для поиска в логах. */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const fieldErrors = error instanceof ApiError ? error.problem.errors : undefined;
  const correlationId = error instanceof ApiError ? error.correlationId : null;
  return (
    <div className="alert alert-error" role="alert">
      <div>{errorMessage(error)}</div>
      {fieldErrors && (
        <ul>
          {Object.entries(fieldErrors).map(([field, messages]) => (
            <li key={field}>
              <code>{field}</code>: {messages.join('; ')}
            </li>
          ))}
        </ul>
      )}
      {(correlationId || (error instanceof ApiError && error.code)) && (
        <div className="muted small">
          {error instanceof ApiError && error.code && (
            <>
              код <code>{error.code}</code>
            </>
          )}
          {correlationId && (
            <>
              {' '}
              · запрос <code>{correlationId}</code>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Notice({ text }: { text: string | null }) {
  return text ? (
    <div className="alert alert-success" role="status">
      {text}
    </div>
  ) : null;
}

export function Spinner() {
  return <div className="muted">Загрузка…</div>;
}
