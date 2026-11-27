import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiResponse, publicApi, tokens, type TokenPair } from './http';

const initial: TokenPair = {
  accessToken: 'access-old', refreshToken: 'refresh-old', tokenType: 'Bearer', expiresIn: 300, refreshExpiresIn: 3600,
};
const fresh = { ...initial, accessToken: 'access-new', refreshToken: 'refresh-new' };

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  tokens.store(initial);
});

afterEach(() => {
  tokens.clear();
  vi.unstubAllGlobals();
});

describe('Kong client', () => {
  it('preserves the exact mutation across a 401 refresh', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(fresh))
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { ETag: '"8"' } }));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();
    const headers = { 'If-Match': '"7"', 'Idempotency-Key': 'intent', 'Content-Type': 'application/merge-patch+json' };
    const body = { place: { name: null } };
    const response = await apiResponse('PATCH', '/draft', body, { headers, signal });

    expect(response.headers.get('etag')).toBe('"8"');
    expect(fetcher.mock.calls.map(([url]) => String(url).replace(/^.*(?=\/(draft|api\/v1\/auth\/refresh)$)/, '')))
      .toEqual(['/draft', '/api/v1/auth/refresh', '/draft']);
    for (const [index, access] of [[0, 'access-old'], [2, 'access-new']] as const) {
      const request = fetcher.mock.calls[index][1];
      expect(request).toMatchObject({ method: 'PATCH', body: JSON.stringify(body), signal });
      const sent = new Headers(request?.headers);
      for (const [name, value] of Object.entries(headers)) expect(sent.get(name)).toBe(value);
      expect(sent.get('authorization')).toBe(`Bearer ${access}`);
    }
  });

  it('does not send credentials or refresh on anonymous 401', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(publicApi('GET', '/search')).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has('authorization')).toBe(false);
  });

  it('does not repeat an aborted request during refresh or report an outage', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(async () => {
        controller.abort();
        return Response.json(fresh);
      });
    vi.stubGlobal('fetch', fetcher);
    await expect(apiResponse('GET', '/draft', undefined, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
