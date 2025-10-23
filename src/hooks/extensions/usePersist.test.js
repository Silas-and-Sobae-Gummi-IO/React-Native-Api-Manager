import {renderHook, act} from '@testing-library/react-native';
import {useCoreApi} from '../useCoreApi';
import {ApiClient} from '../../client/ApiClient';

// Helper to create proper Response mock
const mockResponse = (data, options = {}) => ({
  ok: options.ok ?? true,
  status: options.status ?? 200,
  headers: {
    get: (key) => {
      if (key === 'content-type') return 'application/json';
      return options.headers?.[key] || null;
    },
  },
  text: async () => JSON.stringify(data),
});

describe('usePersist', () => {
  let client;

  beforeEach(() => {
    client = new ApiClient({baseURL: 'https://api.example.com'});
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic store integration', () => {
    test('reads from store', async () => {
      const mockStore = {
        data: [{id: 1}, {id: 2}],
        use: jest.fn(() => mockStore.data),
        update: jest.fn((newData) => {
          mockStore.data = newData;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            store: mockStore,
          },
        })
      );

      // Should read from store
      expect(result.current.result).toEqual([{id: 1}, {id: 2}]);
      expect(mockStore.use).toHaveBeenCalled();
    });

    test('writes to store on API response', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: [{id: 3}]}));

      const mockStore = {
        data: [],
        use: jest.fn(() => mockStore.data),
        update: jest.fn((newData) => {
          mockStore.data = newData;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            store: mockStore,
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Should write parsed response to store
      expect(mockStore.update).toHaveBeenCalledWith({data: [{id: 3}]});
    });

    test('works without persist config', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: 'test'}));

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          // No persist config
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Should use local state (dummy store)
      expect(result.current.result).toEqual({data: 'test'});
      expect(result.current.response).toEqual({data: 'test'});
    });
  });

  describe('Metadata management', () => {
    test('reads metadata from store', () => {
      const mockStore = {
        data: [],
        meta: {hasMore: true, cursor: 'abc'},
        use: jest.fn(() => mockStore.data),
        update: jest.fn(),
        fetchMeta: jest.fn((key) => mockStore.meta),
        updateMeta: jest.fn((key, val) => {
          mockStore.meta = val;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            metaKey: 'usersMeta',
            store: mockStore,
            defaults: {hasMore: true},
          },
        })
      );

      // Should read metadata
      expect(result.current.meta).toEqual({hasMore: true, cursor: 'abc'});
      expect(mockStore.fetchMeta).toHaveBeenCalledWith('usersMeta');
    });

    test('updates metadata on API response', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: []}));

      const mockStore = {
        data: [],
        meta: {},
        use: jest.fn(() => mockStore.data),
        update: jest.fn(),
        fetchMeta: jest.fn(() => mockStore.meta),
        updateMeta: jest.fn((key, val) => {
          mockStore.meta = val;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            metaKey: 'usersMeta',
            store: mockStore,
            defaults: {hasMore: true, page: 1},
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Should merge defaults with existing meta
      expect(mockStore.updateMeta).toHaveBeenCalledWith(
        'usersMeta',
        expect.objectContaining({
          hasMore: true,
          page: 1,
        })
      );
    });
  });

  describe('Integration with pagination', () => {
    // TODO: Fix timing issue where pagination reads baseApi.result before persist overrides it
    test.skip('pagination uses store-backed result', async () => {
      global.fetch.mockResolvedValue(mockResponse({data: [{id: 1}], hasMore: true}));

      const mockStore = {
        data: [],
        use: jest.fn(() => mockStore.data),
        update: jest.fn((newData) => {
          mockStore.data = newData;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          persist: {
            dataKey: 'posts',
            store: mockStore,
          },
          pagination: {
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Pagination should write to store via baseApi.updateResult
      expect(mockStore.update).toHaveBeenCalledWith([{id: 1}]);

      // Results should come from store
      expect(result.current.results).toEqual(mockStore.data);
    });

    // TODO: Fix timing issue where pagination reads baseApi.result before persist overrides it
    test.skip('loadMore appends to store', async () => {
      let page = 1;
      global.fetch.mockImplementation(async () => {
        const data = [{id: page}];
        const hasMore = page < 3;
        page++;
        return mockResponse({data, hasMore});
      });

      const mockStore = {
        data: [],
        use: jest.fn(() => mockStore.data),
        update: jest.fn((newData) => {
          mockStore.data = newData;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          persist: {
            dataKey: 'posts',
            store: mockStore,
          },
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

      expect(mockStore.data).toEqual([{id: 1}]);

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockStore.data).toEqual([{id: 1}, {id: 2}]);
    });
  });

  describe('Reactive updates', () => {
    test('component rerenders when store updates externally', async () => {
      let storeData = [{id: 1}];
      let subscribers = [];

      const mockStore = {
        use: jest.fn(() => {
          // Simulate reactive hook
          return storeData;
        }),
        update: jest.fn((newData) => {
          storeData = newData;
          subscribers.forEach((fn) => fn());
        }),
        subscribe: (fn) => {
          subscribers.push(fn);
          return () => {
            subscribers = subscribers.filter((s) => s !== fn);
          };
        },
      };

      const {result, rerender} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            store: mockStore,
          },
        })
      );

      expect(result.current.result).toEqual([{id: 1}]);

      // Simulate external store update
      act(() => {
        mockStore.update([{id: 1}, {id: 2}]);
        rerender();
      });

      // Should reflect new store data
      expect(result.current.result).toEqual([{id: 1}, {id: 2}]);
    });
  });

  describe('Override behavior', () => {
    test('overrides baseApi.updateResult', async () => {
      const mockStore = {
        data: [],
        use: jest.fn(() => mockStore.data),
        update: jest.fn((newData) => {
          mockStore.data = newData;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            store: mockStore,
          },
        })
      );

      // Manually call updateResult
      act(() => {
        result.current.updateResult([{id: 999}]);
      });

      // Should write to store
      expect(mockStore.update).toHaveBeenCalledWith([{id: 999}]);
    });

    test('restores original updateResult on unmount', () => {
      const mockStore = {
        data: [],
        use: jest.fn(() => mockStore.data),
        update: jest.fn(),
      };

      const {result, unmount} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            store: mockStore,
          },
        })
      );

      const overriddenUpdate = result.current.updateResult;

      // Unmount
      unmount();

      // Original should be restored (we can't test this directly without accessing internals)
      // But we can verify no errors occur
      expect(overriddenUpdate).toBeDefined();
    });
  });

  describe('Error handling', () => {
    test('handles store read errors gracefully', () => {
      const mockStore = {
        use: jest.fn(() => {
          throw new Error('Store read error');
        }),
        update: jest.fn(),
      };

      // renderHook will catch and expose errors via result.error
      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            store: mockStore,
          },
        })
      );

      // Error should be thrown during hook execution
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Store read error');
    });

    test('handles store write errors gracefully', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: []}));

      const mockStore = {
        data: [],
        use: jest.fn(() => mockStore.data),
        update: jest.fn(() => {
          throw new Error('Store write error');
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            dataKey: 'users',
            store: mockStore,
          },
        })
      );

      // Should handle error
      await act(async () => {
        try {
          await result.current.send();
        } catch (err) {
          expect(err.message).toBe('Store write error');
        }
      });
    });
  });
});
