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
  errors?: Record<string, string[]>;
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
    const pair = await send<TokenPair>('POST', '/api/v1/auth/refresh', { refreshToken }, false);
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

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function send<T>(method: Method, path: string, body: unknown, withAuth: boolean): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (withAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(API_BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { message: `Шлюз ${API_BASE_URL} недоступен` }, null);
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  let problem: Problem = {};
  try {
    problem = await response.json();
  } catch {
    // тело не JSON — остаётся только статус
  }
  throw new ApiError(response.status, problem, response.headers.get('X-Correlation-ID'));
}

/** Запрос с access-токеном; при 401 один раз обновляет токены и повторяет. */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (!accessToken && tokens.hasRefreshToken()) await refreshTokens();
  try {
    return await send<T>(method, path, body, true);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && (await refreshTokens())) {
      return send<T>(method, path, body, true);
    }
    throw error;
  }
}

/** Публичный запрос без токена: вход, регистрация. */
export function publicApi<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return send<T>(method, path, body, false);
}
