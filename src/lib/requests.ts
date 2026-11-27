import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ApiError } from '@/api/http';

export const pageSize = 20;

export function query(values: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value != null && value !== '') params.set(name, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 412);
}

export function isAmbiguous(error: unknown): boolean {
  return error instanceof ApiError && [0, 502, 503, 504].includes(error.status);
}

export interface ReadResult<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

export function useRead<T>(load: (signal: AbortSignal) => Promise<T>, key: string): ReadResult<T> {
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  const runLoad = useEffectEvent(load);
  const [result, setResult] = useState<{ key: string; revision: number; data?: T; error?: unknown }>();
  useEffect(() => {
    const controller = new AbortController();
    runLoad(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ key, revision, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setResult({ key, revision, error }); },
    );
    return () => controller.abort();
  }, [key, revision]);
  const current = result?.key === key && result.revision === revision ? result : undefined;
  return { data: current?.data, error: current?.error, loading: !current, reload };
}

type Request = (key: string) => Promise<void>;
type Attempt = { key: string; request: Request };

/** Only an explicit repeat of an ambiguous attempt may reuse its key. */
export function useIntent() {
  const inFlight = useRef(false);
  const unresolved = useRef<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);

  async function perform(attempt: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await attempt.request(attempt.key);
      unresolved.current = null;
      setUncertain(false);
    } catch (error) {
      unresolved.current = isAmbiguous(error) ? attempt : null;
      setUncertain(unresolved.current !== null);
      setError(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    error,
    uncertain,
    async run(request: Request) {
      if (!unresolved.current && !inFlight.current) await perform({ request, key: crypto.randomUUID() });
    },
    async retry() { if (unresolved.current) await perform(unresolved.current); },
    clear() {
      if (inFlight.current) return;
      unresolved.current = null;
      setUncertain(false);
      setError(null);
    },
    resetError() { if (!unresolved.current) setError(null); },
  };
}
