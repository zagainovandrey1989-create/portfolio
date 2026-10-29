import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('unwraps the data envelope', async () => {
    mockFetch(200, { data: [{ id: 1, name: 'Board' }] });
    await expect(api.listBoards()).resolves.toEqual([{ id: 1, name: 'Board' }]);
  });

  it('builds the filter query string', async () => {
    const fetchMock = mockFetch(200, { data: [] });
    await api.listTasks(3, { assignee: 'Ann Lee', status: 'done' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/boards/3/tasks?assignee=Ann+Lee&status=done');
  });

  it('sends JSON bodies', async () => {
    const fetchMock = mockFetch(200, { data: { id: 5 } });
    await api.moveTask(5, 'done', 2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/tasks/5/move');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'done', position: 2 });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('handles 204 responses', async () => {
    mockFetch(204);
    await expect(api.deleteTask(1)).resolves.toBeUndefined();
  });

  it('throws ApiError with server details', async () => {
    mockFetch(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: [{ path: 'title', message: 'Title is required' }] },
    });
    const error = await api.createTask(1, { title: '', description: '', assignee: null, status: 'todo' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details: [{ path: 'title' }] });
  });

  it('wraps network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.listBoards()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
