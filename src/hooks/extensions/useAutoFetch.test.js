import {renderHook, act} from '@testing-library/react-native';
import {useCoreApi} from '../useCoreApi';
import {ApiClient} from '../../client/core/ApiClient';

describe('useAutoFetch', () => {
  let client;

  beforeEach(() => {
    client = new ApiClient({baseURL: 'https://api.example.com'});
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Auto-fetch on mount', () => {
    test('auto-fetches on mount by default', async () => {
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

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(fetchCount).toBe(1);
    });

    test('does not auto-fetch when disabled', async () => {
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
          autoFetch: {enabled: false},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(fetchCount).toBe(0);
    });

    test('respects runOnMount config', async () => {
      let fetchCount = 0;
      global.fetch.mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({}),
        };
      });

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: {runOnMount: false},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(fetchCount).toBe(0);
    });
  });

  describe('Conditional fetching', () => {
    test('condition can prevent fetch', async () => {
      let fetchCount = 0;
      global.fetch.mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({}),
        };
      });

      const condition = jest.fn(() => false);

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: {condition},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(condition).toHaveBeenCalled();
      expect(fetchCount).toBe(0);
    });

    test('condition can allow fetch', async () => {
      let fetchCount = 0;
      global.fetch.mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({}),
        };
      });

      const condition = jest.fn(() => true);

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: {condition},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(condition).toHaveBeenCalled();
      expect(fetchCount).toBe(1);
    });

    test('autoFetch:shouldFetch hook can override condition', async () => {
      let fetchCount = 0;
      global.fetch.mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({}),
        };
      });

      const condition = () => false; // Would prevent fetch

      const useOverrideExtension = (interceptors) => {
        interceptors.add('autoFetch:shouldFetch', () => true); // Override to allow
        return {};
      };

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: {condition},
          extensions: {
            override: useOverrideExtension,
          },
          override: {},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(fetchCount).toBe(1); // Should fetch despite condition being false
    });
  });

  describe('Fetch data override', () => {
    test('sends fetchData on mount', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      renderHook(() =>
        useCoreApi({
          client,
          url: 'POST:/posts',
          initialData: {category: 'tech'},
          autoFetch: {
            fetchData: {featured: true},
          },
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(global.fetch).toHaveBeenCalled();
      const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(sentBody).toEqual({category: 'tech', featured: true});
    });
  });

  describe('Lifecycle callbacks', () => {
    test('onAutoFetch fires when auto-fetch triggers', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const onAutoFetch = jest.fn();

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: {onAutoFetch},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(onAutoFetch).toHaveBeenCalled();
    });
  });

  describe('Extension hooks', () => {
    test('autoFetch:beforeFetch fires before fetch', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      let beforeFetchFired = false;

      const useCustomExtension = (interceptors) => {
        interceptors.add('autoFetch:beforeFetch', () => {
          beforeFetchFired = true;
        });
        return {};
      };

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: true,
          extensions: {
            custom: useCustomExtension,
          },
          custom: {},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(beforeFetchFired).toBe(true);
    });

    test('autoFetch:afterFetch fires after fetch', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({data: 'test'}),
      });

      let afterFetchFired = false;

      const useCustomExtension = (interceptors) => {
        interceptors.add('autoFetch:afterFetch', () => {
          afterFetchFired = true;
        });
        return {};
      };

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: true,
          extensions: {
            custom: useCustomExtension,
          },
          custom: {},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(afterFetchFired).toBe(true);
    });
  });

  describe('Abort on unmount', () => {
    test('aborts request on unmount when configured', async () => {
      let abortCalled = false;
      global.fetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      const onAbort = jest.fn(() => {
        abortCalled = true;
      });

      const {unmount} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: {abortOnUnmount: true},
          onAbort,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Unmount while request is in flight
      unmount();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(onAbort).toHaveBeenCalledWith('unmount');
    });

    test('does not abort on unmount by default', async () => {
      global.fetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      const onAbort = jest.fn();

      const {unmount} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: true,
          onAbort,
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      unmount();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // Should not have been called
      expect(onAbort).not.toHaveBeenCalled();
    });
  });

  describe('Integration with other extensions', () => {
    test('auto-fetch works with pagination', async () => {
      const mockApiData = {data: [{id: 1}], hasMore: true};

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({'Content-Type': 'application/json'}),
        text: async () => JSON.stringify(mockApiData),
        json: async () => mockApiData,
      });

      const {result} = renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: true,
          pagination: {
            extractResults: (r) => r.data,
            hasMoreFn: (r) => r.hasMore,
          },
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Should have auto-fetched and populated results
      expect(result.current.results).toEqual([{id: 1}]);
      expect(result.current.hasMore).toBe(true);
    });

    test('auto-fetch respects disabled state', async () => {
      let fetchCount = 0;
      global.fetch.mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({}),
        };
      });

      renderHook(() =>
        useCoreApi({
          client,
          url: 'GET:/posts',
          autoFetch: {enabled: false, runOnMount: true},
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // enabled: false should prevent fetch even if runOnMount is true
      expect(fetchCount).toBe(0);
    });
  });
});
