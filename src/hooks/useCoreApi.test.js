import {renderHook, act} from '@testing-library/react-native';
import {useCoreApi} from './useCoreApi';
import {ApiClient} from '../client/core/ApiClient';

describe('useCoreApi', () => {
  let client;

  beforeEach(() => {
    // Create client with proper interceptor initialization
    client = new ApiClient({baseURL: 'https://api.example.com'});
    global.fetch = jest.fn();

    // Ensure fetch returns proper Response objects for parsing
    jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic integration', () => {
    test('works without any extensions', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({success: true}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
        })
      );

      expect(result.current.send).toBeDefined();
      expect(result.current.data).toBeDefined();

      // Should NOT have extension methods/state
      expect(result.current.results).toBeUndefined();
      expect(result.current.loadMore).toBeUndefined();
      expect(result.current.refresh).toBeUndefined();
      expect(result.current.isRefreshing).toBeUndefined();
    });

    test('base API functionality works', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({message: 'hello'}),
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'POST:/test',
          initialData: {name: 'test'},
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(global.fetch).toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Built-in extensions', () => {
    test('pagination extension adds state and methods', () => {
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
      expect(result.current.loadMore).toBeDefined();
      expect(result.current.resetPagination).toBeDefined();
    });

    test('refresh extension adds state and methods', () => {
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

    test('autoFetch extension works', async () => {
      let fetchCount = 0;
      global.fetch.mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({count: fetchCount}),
        };
      });

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: true,
        })
      );

      // Wait longer for onMount effect to trigger
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      expect(fetchCount).toBeGreaterThanOrEqual(1);
    });

    test('multiple extensions work together', () => {
      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          pagination: {pageKey: 'page'},
          refresh: true,
          autoFetch: {runOnMount: false}, // Disable auto-fetch for test
        })
      );

      // Should have all extension features
      expect(result.current.results).toBeDefined();
      expect(result.current.loadMore).toBeDefined();
      expect(result.current.refresh).toBeDefined();
      expect(result.current.isRefreshing).toBe(false);
    });
  });

  describe('Custom extensions', () => {
    test('accepts custom extension', () => {
      const useCustomExtension = jest.fn(() => ({
        customMethod: () => 'custom',
        customState: 'test',
      }));

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          extensions: {
            custom: useCustomExtension,
          },
          custom: {foo: 'bar'},
        })
      );

      expect(useCustomExtension).toHaveBeenCalled();
      expect(result.current.customMethod).toBeDefined();
      expect(result.current.customState).toBe('test');
    });

    test('custom extension can override built-in', () => {
      const useCustomPagination = jest.fn(() => ({
        results: ['custom'],
        loadMore: () => 'custom-load-more',
      }));

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          extensions: {
            pagination: useCustomPagination, // Override built-in
          },
          pagination: {custom: true},
        })
      );

      expect(useCustomPagination).toHaveBeenCalled();
      expect(result.current.results).toEqual(['custom']);
      expect(result.current.loadMore()).toBe('custom-load-more');
    });

    test('custom extension receives interceptors and baseApi', () => {
      let receivedInterceptors, receivedBaseApi;

      const useCustomExtension = (interceptors, baseApi, config) => {
        receivedInterceptors = interceptors;
        receivedBaseApi = baseApi;
        return {};
      };

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          extensions: {
            custom: useCustomExtension,
          },
          custom: {},
        })
      );

      expect(receivedInterceptors).toBeDefined();
      expect(receivedInterceptors.add).toBeDefined();
      expect(receivedBaseApi).toBeDefined();
      expect(receivedBaseApi.send).toBeDefined();
    });

    test('multiple custom extensions', () => {
      const useExt1 = () => ({feature1: 'a'});
      const useExt2 = () => ({feature2: 'b'});

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          extensions: {
            ext1: useExt1,
            ext2: useExt2,
          },
          ext1: {},
          ext2: {},
        })
      );

      expect(result.current.feature1).toBe('a');
      expect(result.current.feature2).toBe('b');
    });
  });

  describe('Extension config normalization', () => {
    test('boolean true becomes empty object', () => {
      let receivedConfig;

      const useTestExtension = (i, b, config) => {
        receivedConfig = config;
        return {};
      };

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          extensions: {
            test: useTestExtension,
          },
          test: true,
        })
      );

      expect(receivedConfig).toEqual({});
    });

    test('boolean false becomes null', () => {
      let receivedConfig;

      const useTestExtension = (i, b, config) => {
        receivedConfig = config;
        return {};
      };

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          extensions: {
            test: useTestExtension,
          },
          test: false,
        })
      );

      expect(receivedConfig).toBeNull();
    });

    test('object config passed as-is', () => {
      let receivedConfig;

      const useTestExtension = (i, b, config) => {
        receivedConfig = config;
        return {};
      };

      const testConfig = {foo: 'bar', baz: 123};

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          extensions: {
            test: useTestExtension,
          },
          test: testConfig,
        })
      );

      expect(receivedConfig).toEqual(testConfig);
    });
  });

  describe('Extension interaction via interceptors', () => {
    test('extensions can communicate through interceptors', async () => {
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
            pageKey: 'page',
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
          refresh: true,
        })
      );

      // Load initial data
      await act(async () => {
        await result.current.send();
      });

      // Wait for pagination hooks to process
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(result.current.results).toEqual([{id: 1}]);

      // Refresh should reset pagination
      await act(async () => {
        await result.current.refresh();
      });

      // Wait for hooks
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // Pagination should be reset (results replaced, not appended)
      expect(result.current.results.length).toBe(1);
    });
  });
});
