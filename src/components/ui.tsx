import { useEffect, useRef, type ReactNode } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { ApiError } from '../api/http';
import { errorMessage } from '../api/messages';

/** Ошибка API: текст, ошибки по полям и идентификатор запроса для поиска в логах. */
export function ErrorBox({ error }: { error: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  const problem = error instanceof ApiError ? error.problem : undefined;
  const fieldErrors = Array.isArray(problem?.errors)
    ? problem.errors.map(({ field, message }) => [field, message] as const)
    : Object.entries(problem?.errors ?? {}).map(([field, messages]) => [field, messages.join('; ')] as const);
  const correlationId = error instanceof ApiError ? error.correlationId : null;
  const diagnostics = [problem?.code && `код ${problem.code}`, correlationId && `запрос ${correlationId}`].filter(Boolean);
  return (
    <Alert ref={ref} tabIndex={-1} variant="destructive" className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{errorMessage(error)}</AlertTitle>
      {fieldErrors.length > 0 && (
        <AlertDescription>
          <ul className="list-disc pl-4">
            {fieldErrors.map(([field, message], index) => <li key={`${field}-${index}`}><code>{field}</code>: {message}</li>)}
          </ul>
        </AlertDescription>
      )}
      {diagnostics.length > 0 && <div className="col-start-2 break-all text-xs text-muted-foreground">{diagnostics.join(' · ')}</div>}
    </Alert>
  );
}

export function Notice({ text, children }: { text?: string | null; children?: ReactNode }) {
  const content = children ?? text;
  return content ? <Alert role="status" className="border-primary/25 bg-accent text-accent-foreground">{content}</Alert> : null;
}

export function Spinner() {
  return <div role="status" className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />Загрузка…</div>;
}
