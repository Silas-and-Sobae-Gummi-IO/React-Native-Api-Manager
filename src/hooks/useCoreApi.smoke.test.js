import {renderHook, act} from '@testing-library/react-hooks';
import {useCoreApi} from './useCoreApi';
import {ApiClient} from '../client/ApiClient';

describe('useCoreApi - Smoke Test', () => {
  let client;

  beforeEach(() => {
    client = new ApiClient({baseURL: 'https://api.example.com'});
    global.fetch = jest.fn();
  });

  test('basic usage without extensions', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({message: 'success'}),
    });

    const {result} = renderHook(() =>
      useCoreApi({
        client,
        url: 'GET:/test',
        initialData: {},
      })
    );

    expect(result.current.data).toEqual({});
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.response).toEqual({message: 'success'});
  });

  test('with pagination extension', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({data: [{id: 1}, {id: 2}], hasMore: true}),
    });

    const {result} = renderHook(() =>
      useCoreApi({
        client,
        url: 'GET:/posts',
        initialData: {page: 1},
        pagination: {
          pageKey: 'page',
          extractResults: (response) => response.data,
          hasMoreFn: (response) => response.hasMore,
        },
      })
    );

    // Should have pagination state
    expect(result.current.results).toEqual([]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loadMore).toBeDefined();

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.results).toEqual([{id: 1}, {id: 2}]);
  });

  test('with refresh extension', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({data: 'refreshed'}),
    });

    const {result} = renderHook(() =>
      useCoreApi({
        client,
        url: 'GET:/posts',
        refresh: true,
      })
    );

    // Should have refresh state and method
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.refresh).toBeDefined();

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.response).toEqual({data: 'refreshed'});
  });

  test('without extensions (conditional configs = null)', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({data: 'test'}),
    });

    const {result} = renderHook(() =>
      useCoreApi({
        client,
        url: 'GET:/posts',
        // No pagination or refresh config
      })
    );

    // Should NOT have extension state/methods
    expect(result.current.results).toBeUndefined();
    expect(result.current.loadMore).toBeUndefined();
    expect(result.current.isRefreshing).toBeUndefined();
    expect(result.current.refresh).toBeUndefined();

    // But should still have base functionality
    expect(result.current.send).toBeDefined();
    expect(result.current.data).toBeDefined();
  });
});
