/**
 * HTTP-клиент для API платформы. Все запросы идут через шлюз Kong.
 *
 * Access-токен хранится только в памяти. Refresh-токен — в localStorage, чтобы вход
 * переживал перезагрузку страницы. При ответе 401 клиент один раз обновляет пару токенов
 * и повторяет запрос.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

const REFRESH_TOKEN_KEY = 'sd.refreshToken';

/** Ошибка в формате application/problem+json; у ошибок самого Kong есть только message. */
export interface Problem {
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]> | { field: string; code?: string; message: string }[];
  message?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
    readonly correlationId: string | null,
  ) {
    super(problem.detail ?? problem.message ?? problem.title ?? `HTTP ${status}`);
  }

  get code(): string | undefined {
    return this.problem.code;
  }
}

export interface TokenPair {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};

export const tokens = {
  hasRefreshToken: () => readRefreshToken() !== null,
  store(pair: TokenPair) {
    accessToken = pair.accessToken;
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, pair.refreshToken);
    } catch {
      // Без localStorage вход просто не переживёт перезагрузку страницы.
    }
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // ничего не делаем
    }
  },
  /** Вызывается, когда сессию восстановить нельзя: refresh-токен отозван или истёк. */
  onSessionLost(callback: () => void) {
    onSessionLost = callback;
  },
};

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Обновляет пару токенов. Параллельные вызовы ждут один запрос: повторное предъявление
 * старого refresh-токена auth считает кражей и завершает сессию.
 */
export function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return false;
  try {
    const pair = await publicApi<TokenPair>('POST', '/api/v1/auth/refresh', { refreshToken });
    tokens.store(pair);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      tokens.clear();
      onSessionLost();
    }
    return false;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  headers?: HeadersInit;
  signal?: AbortSignal;
}

function prepare(method: Method, body: unknown, options?: RequestOptions): RequestInit {
  const headers = new Headers(options?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json, application/problem+json');
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return { method, headers, signal: options?.signal, body: multipart || body === undefined ? body : JSON.stringify(body) };
}

async function send(path: string, request: RequestInit, jwt: string | null): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete('Authorization');
  if (jwt) headers.set('Authorization', `Bearer ${jwt}`);

  let response: Response;
  request.signal?.throwIfAborted();
  try {
    response = await fetch(API_BASE_URL + path, { ...request, headers });
  } catch (error) {
    request.signal?.throwIfAborted();
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(0, {}, null);
  }
  if (response.ok) return response;

  let problem: Problem = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') problem = parsed as Problem;
  } catch {
    request.signal?.throwIfAborted();
  }
  throw new ApiError(response.status, problem, response.headers.get('X-Correlation-ID'));
}

async function parsed<T>(response: Response): Promise<T> {
  const text = response.status === 204 ? '' : await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Запрос с access-токеном; при 401 один раз обновляет токены и повторяет. */
export async function apiResponse(
  method: Method,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<Response> {
  const request = prepare(method, body, options);
  const signal = options?.signal;
  signal?.throwIfAborted();
  if (!accessToken && tokens.hasRefreshToken()) await refreshTokens();
  const attemptedToken = accessToken;
  try {
    return await send(path, request, attemptedToken);
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const refreshed = (accessToken !== null && accessToken !== attemptedToken) || (await refreshTokens());
    signal?.throwIfAborted();
    if (refreshed) return send(path, request, accessToken);
    throw error;
  }
}

export async function api<T>(method: Method, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return parsed<T>(await apiResponse(method, path, body, options));
}

/** Публичный запрос без токена и без обновления сессии. */
export async function publicApi<T>(method: Method, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return parsed<T>(await send(path, prepare(method, body, options), null));
}
