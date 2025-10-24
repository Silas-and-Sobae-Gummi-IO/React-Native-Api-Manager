import {renderHook, act} from '@testing-library/react-native';
import {useCoreApi} from '../useCoreApi';
import {ApiClient} from '../../client/ApiClient';

describe('usePagination', () => {
  let client;

  beforeEach(() => {
    client = new ApiClient({baseURL: 'https://api.example.com'});
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic pagination', () => {
    test('initializes with empty results', () => {
      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {
            pageKey: 'page',
          },
        })
      );

      expect(result.current.results).toEqual([]);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.isLoadingMore).toBe(false);
    });

    test('accumulates results on send', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: [{id: 1}, {id: 2}], hasMore: true}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          initialData: {page: 1},
          pagination: {
            pageKey: 'page',
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.results).toEqual([{id: 1}, {id: 2}]);
      expect(result.current.hasMore).toBe(true);
    });

    test('loadMore increments page and appends results', async () => {
      let pageRequested = 1;
      global.fetch.mockImplementation(async (url) => {
        const urlObj = new URL(url);
        const body = await fetch.mock.calls[fetch.mock.calls.length - 1][1].body;
        const parsed = JSON.parse(body || '{}');
        pageRequested = parsed.page || 1;

        return {
          ok: true,
          headers: new Headers({'Content-Type': 'application/json'}),
          text: async () =>
            JSON.stringify({
              data: [{id: pageRequested}],
              hasMore: pageRequested < 3,
            }),
        };
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'POST:/posts',
          initialData: {page: 1},
          pagination: {
            pageKey: 'page',
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      // Initial load
      await act(async () => {
        await result.current.send();
      });

      expect(result.current.results).toEqual([{id: 1}]);

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.results).toEqual([{id: 1}, {id: 2}]);
      expect(result.current.hasMore).toBe(true);
    });

    test('stops loading when hasMore is false', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: [{id: 1}], hasMore: false}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.hasMore).toBe(false);

      // Try to load more - should be prevented
      await act(async () => {
        await result.current.loadMore();
      });

      // Should only have called fetch once (initial)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cursor pagination', () => {
    test('supports cursor-based pagination', async () => {
      global.fetch.mockImplementation(async (url, options) => {
        const body = JSON.parse(options.body || '{}');
        const cursor = body.cursor;

        if (!cursor) {
          return {
            ok: true,
            headers: new Headers({'Content-Type': 'application/json'}),
            text: async () =>
              JSON.stringify({
                data: [{id: 1}],
                nextCursor: 'cursor-2',
                hasMore: true,
              }),
          };
        } else if (cursor === 'cursor-2') {
          return {
            ok: true,
            headers: new Headers({'Content-Type': 'application/json'}),
            text: async () =>
              JSON.stringify({
                data: [{id: 2}],
                nextCursor: null,
                hasMore: false,
              }),
          };
        }
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'POST:/posts',
          pagination: {
            getNextPageData: (currentData, lastResponse) => ({
              cursor: lastResponse?.nextCursor,
            }),
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      // Initial load
      await act(async () => {
        await result.current.send();
      });

      expect(result.current.results).toEqual([{id: 1}]);

      // Load more with cursor
      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.results).toEqual([{id: 1}, {id: 2}]);
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('Reset pagination', () => {
    test('resetPagination clears results', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: [{id: 1}], hasMore: true}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.results).toEqual([{id: 1}]);

      act(() => {
        result.current.resetPagination();
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.hasMore).toBe(true);
    });

    test('refresh resets pagination', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: [{id: Math.random()}], hasMore: true}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {
            pageKey: 'page',
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
          refresh: true,
        })
      );

      // Load initial
      await act(async () => {
        await result.current.send();
      });

      const initialResults = result.current.result;
      expect(result.current.result.length).toBe(1);

      // sanity check for loading more
      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.result.length).toBe(2);

      // Refresh should reset pagination
      await act(async () => {
        await result.current.refresh();
      });

      // Should have replaced results, not appended
      expect(result.current.result.length).toBe(1);
      expect(result.current.result).not.toEqual(initialResults);
    });
  });

  describe('Loading states', () => {
    test('isLoadingMore tracks loadMore state', async () => {
      let resolveFetch;
      global.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {extractResults: (r) => r.data || []},
        })
      );

      expect(result.current.isLoadingMore).toBe(false);

      // Start loadMore
      act(() => {
        result.current.loadMore();
      });

      expect(result.current.isLoadingMore).toBe(true);

      // important, tick it
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // NOW, resolveFetch should be a function
      expect(resolveFetch).toBeInstanceOf(Function);

      // Resolve request
      await act(async () => {
        resolveFetch({
          ok: true,
          headers: new Headers({'Content-Type': 'application/json'}),
          text: async () => JSON.stringify({data: []}),
        });
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.isLoadingMore).toBe(false);
    });
  });

  describe('shouldReplace logic', () => {
    test('replaces results when empty', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: [{id: 1}]}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {
            extractResults: (r) => r.data,
            shouldReplace: (ctx) => ctx.results.length === 0,
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.results).toEqual([{id: 1}]);
    });

    test('custom shouldReplace function', async () => {
      let callCount = 0;
      global.fetch.mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          headers: new Headers({'Content-Type': 'application/json'}),
          text: async () => JSON.stringify({data: [{id: callCount}], reset: callCount === 2}),
        };
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {
            extractResults: (r) => r.data,
            shouldReplace: (ctx) => ctx.response?.reset === true,
          },
        })
      );

      // First call
      await act(async () => {
        await result.current.send();
      });

      expect(result.current.results).toEqual([{id: 1}]);

      // Second call with reset flag
      await act(async () => {
        await result.current.send();
      });

      // Should replace (not append)
      expect(result.current.results).toEqual([{id: 2}]);
    });
  });
});
