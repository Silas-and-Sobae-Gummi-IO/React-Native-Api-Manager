import {renderHook, act} from '@testing-library/react-native';
import {useCoreApi} from '../useCoreApi';
import {ApiClient} from '../../client/ApiClient';

describe('useRefresh', () => {
  let client;

  beforeEach(() => {
    client = new ApiClient({baseURL: 'https://api.example.com'});
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic refresh', () => {
    test('initializes with isRefreshing false', () => {
      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          refresh: true,
        })
      );

      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.refresh).toBeDefined();
    });

    test('refresh() sends request with current data', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: 'refreshed'}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'POST:/posts',
          initialData: {category: 'tech'},
          refresh: true,
        })
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/posts', expect.objectContaining({method: 'POST'}));

      const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(sentBody.category).toBe('tech');
    });

    test('isRefreshing tracks state during refresh', async () => {
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
          refresh: true,
        })
      );

      expect(result.current.isRefreshing).toBe(false);

      // Start refresh
      act(() => {
        result.current.refresh();
      });

      expect(result.current.isRefreshing).toBe(true);

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
          text: async () => JSON.stringify({data: 'done'}),
        });
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.isRefreshing).toBe(false);
    });

    test('handles refresh errors correctly', async () => {
      const error = new Error('Network error');
      global.fetch.mockRejectedValue(error);

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          refresh: true,
        })
      );

      await act(async () => {
        try {
          await result.current.refresh();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.error).toBe(error);
    });
  });

  describe('Refresh with reset', () => {
    test('refresh(true) resets state before fetching', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: 'new'}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'POST:/posts',
          initialData: {name: 'initial'},
          refresh: true,
        })
      );

      // Modify data
      act(() => {
        result.current.updateData('name', 'modified');
      });

      expect(result.current.data.name).toBe('modified');

      // Refresh with reset
      await act(async () => {
        await result.current.refresh(true);
      });

      // Data should be reset to initial
      expect(result.current.data).toEqual({name: 'initial'});
    });

    test('refresh(false) keeps current data', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: 'new'}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'POST:/posts',
          initialData: {name: 'initial'},
          refresh: true,
        })
      );

      // Modify data
      act(() => {
        result.current.updateData('name', 'modified');
      });

      // Refresh without reset (default)
      await act(async () => {
        await result.current.refresh();
      });

      // Data should still be modified
      expect(result.current.data.name).toBe('modified');
    });
  });

  describe('Callback hooks', () => {
    test('onRefresh callback fires when refresh is triggered', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: 'test'}),
      });

      const onRefresh = jest.fn();

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          refresh: {onRefresh},
        })
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(onRefresh).toHaveBeenCalled();
    });
  });

  describe('Integration with pagination', () => {
    test('refresh resets pagination to page 1', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: [{id: Math.random()}], hasMore: true}),
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
          refresh: true,
        })
      );

      // Load page 1
      await act(async () => {
        await result.current.send();
      });

      const page1Results = result.current.results;

      // Load more (page 2)
      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.results.length).toBe(2);

      // Refresh - should reset to page 1
      await act(async () => {
        await result.current.refresh();
      });

      // Should have only 1 result (page 1)
      expect(result.current.results.length).toBe(1);
      expect(result.current.results).not.toEqual(page1Results);
    });

    test('refresh:beforeSend hook fires before refresh', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify({data: []}),
      });

      let beforeSendFired = false;

      const useCustomExtension = (interceptors, baseApi, config) => {
        if (!config) return {};

        interceptors.replace('refresh:beforeSend', 'custom', () => {
          beforeSendFired = true;
        });

        return {};
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          refresh: true,
          extensions: {
            custom: useCustomExtension,
          },
          custom: {},
        })
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(beforeSendFired).toBe(true);
    });
  });

  describe('Multiple refreshes', () => {
    test('can refresh multiple times', async () => {
      let refreshCount = 0;
      global.fetch.mockImplementation(async () => {
        refreshCount++;
        return {
          ok: true,
          headers: new Headers({'Content-Type': 'application/json'}),
          text: async () => JSON.stringify({count: refreshCount}),
        };
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          refresh: true,
        })
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.result.count).toBe(1);

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.result.count).toBe(2);
    });
  });
});
