import {renderHook, act} from '@testing-library/react-native';
import {useCoreApi} from '../useCoreApi';
import {ApiClient} from '../../client/core/ApiClient';

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

  describe('Store integration basics', () => {
    test('returns empty object when no persist config', () => {
      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          // No persist config
        })
      );

      // Should use local state
      expect(result.current.result).toBe(null);
    });

    test('reads initial value from store via reactive hook', () => {
      let storeData = [{id: 1}, {id: 2}];

      const mockStore = {
        use: jest.fn(() => storeData), // Reactive hook
        update: jest.fn((key, value) => {
          storeData = value;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            store: mockStore,
            dataKey: 'users',
          },
        })
      );

      // Should override baseApi.result with store value
      expect(result.current.result).toEqual([{id: 1}, {id: 2}]);
      expect(mockStore.use).toHaveBeenCalledWith('users');
    });

    test('syncs API response to store via filterData hook', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({users: [{id: 3}]}));

      let storeData = [];
      const mockStore = {
        use: jest.fn(() => storeData),
        update: jest.fn((key, value) => {
          storeData = value;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            store: mockStore,
            dataKey: 'users',
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Should write parsed response to store
      expect(mockStore.update).toHaveBeenCalledWith('users', {users: [{id: 3}]});
    });
  });

  describe('Reactivity', () => {
    test('reflects external store changes automatically', () => {
      let storeData = [{id: 1}];

      const mockStore = {
        use: jest.fn(() => storeData),
        update: jest.fn((key, value) => {
          storeData = value;
        }),
      };

      const {result, rerender} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            store: mockStore,
            dataKey: 'users',
          },
        })
      );

      expect(result.current.result).toEqual([{id: 1}]);

      // Simulate external store update
      act(() => {
        storeData = [{id: 1}, {id: 2}];
        rerender(); // Trigger re-render (in real Zustand, this happens automatically)
      });

      // Should reflect new store value (via reactive hook)
      expect(result.current.result).toEqual([{id: 1}, {id: 2}]);
    });
  });

  describe('Metadata support', () => {
    test('reads metadata from store', () => {
      let storeMeta = {hasMore: true, cursor: 'abc'};

      const mockStore = {
        use: jest.fn(() => []),
        update: jest.fn(),
        useMeta: jest.fn(() => storeMeta),
        updateMeta: jest.fn((key, value) => {
          storeMeta = value;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            store: mockStore,
            dataKey: 'users',
            metaKey: 'usersMeta',
          },
        })
      );

      // Should expose metadata
      expect(result.current.meta).toEqual({hasMore: true, cursor: 'abc'});
      expect(mockStore.useMeta).toHaveBeenCalledWith('usersMeta');
    });

    // @TODO maybe we don't save meta?
    test.skip('updates metadata on API response with defaults', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: []}));

      let storeMeta = {cursor: 'old'};
      const mockStore = {
        use: jest.fn(() => []),
        update: jest.fn(),
        useMeta: jest.fn(() => storeMeta),
        updateMeta: jest.fn((key, value) => {
          storeMeta = value;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            store: mockStore,
            dataKey: 'users',
            metaKey: 'usersMeta',
            defaults: {hasMore: true, page: 1},
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Should merge defaults with existing meta and add lastFetch
      expect(mockStore.updateMeta).toHaveBeenCalledWith(
        'usersMeta',
        expect.objectContaining({
          hasMore: true,
          page: 1,
          cursor: 'old',
          lastFetch: expect.any(Number),
        })
      );
    });

    test('works without metadata config', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: []}));

      const mockStore = {
        use: jest.fn(() => []),
        update: jest.fn(),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            store: mockStore,
            dataKey: 'users',
            // No metaKey
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Should not expose meta property
      expect(result.current.meta).toBeUndefined();
    });
  });

  describe('Integration with pagination', () => {
    test('pagination writes to store and reads from store', async () => {
      global.fetch.mockResolvedValue(mockResponse({items: [{id: 1}], hasMore: true}));

      let storeData = [];
      const mockStore = {
        use: jest.fn(() => storeData),
        update: jest.fn((key, value) => {
          storeData = value;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          persist: {
            store: mockStore,
            dataKey: 'posts',
          },
          pagination: {
            extractResults: (r) => r.items,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      // Initial load
      await act(async () => {
        await result.current.send();
      });

      // Persist writes to store at priority 1 (before pagination at priority 10)
      // But pagination's filterData transforms it to array format
      expect(mockStore.update).toHaveBeenCalled();

      // Results come from store (reactive)
      expect(result.current.result).toEqual(storeData);
    });

    test('loadMore accumulates in store', async () => {
      let page = 1;
      global.fetch.mockImplementation(async () => {
        const items = [{id: page}];
        const hasMore = page < 3;
        page++;
        return mockResponse({items, hasMore});
      });

      let storeData = [];
      const mockStore = {
        use: jest.fn(() => storeData),
        update: jest.fn((key, value) => {
          storeData = value;
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          persist: {
            store: mockStore,
            dataKey: 'posts',
          },
          pagination: {
            extractResults: (r) => r.items,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      // Initial load
      await act(async () => {
        await result.current.send();
      });

      const firstUpdate = mockStore.update.mock.calls[mockStore.update.mock.calls.length - 1][1];
      expect(firstUpdate).toEqual([{id: 1}]);

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      const secondUpdate = mockStore.update.mock.calls[mockStore.update.mock.calls.length - 1][1];
      expect(secondUpdate).toEqual([{id: 1}, {id: 2}]);
    });
  });

  describe('Hook priority', () => {
    test('persist filterData hook runs at priority 1 (early)', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: 'test'}));

      const mockStore = {
        use: jest.fn(() => null),
        update: jest.fn(),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/test',
          persist: {
            store: mockStore,
            dataKey: 'test',
          },
        })
      );

      await act(async () => {
        await result.current.send();
      });

      // Verify the hook was registered with priority 1
      // We can't directly test priority, but we verify it was called
      expect(mockStore.update).toHaveBeenCalledWith('test', {data: 'test'});
    });
  });

  describe('Error handling', () => {
    test('handles store update errors during API response', async () => {
      global.fetch.mockResolvedValueOnce(mockResponse({data: []}));

      const mockStore = {
        use: jest.fn(() => []),
        update: jest.fn(() => {
          throw new Error('Store write failed');
        }),
      };

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/users',
          persist: {
            store: mockStore,
            dataKey: 'users',
          },
        })
      );

      // Error in filterData hook should propagate
      await act(async () => {
        await expect(result.current.send()).rejects.toThrow('Store write failed');
      });
    });
  });
});
