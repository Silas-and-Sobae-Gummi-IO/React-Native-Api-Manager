import {renderHook, act} from '@testing-library/react-native';
import {useBaseApi} from './useBaseApi';
import {ApiClient} from '../client/ApiClient';
import {InterceptorManager} from '../client/lib/InterceptorManager';

describe('useBaseApi', () => {
  let client;
  let interceptors;

  beforeEach(() => {
    client = new ApiClient({baseURL: 'https://api.example.com'});
    interceptors = new InterceptorManager();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    test('initializes with default state', () => {
      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            initialData: {foo: 'bar'},
          },
          interceptors
        )
      );

      expect(result.current.data).toEqual({foo: 'bar'});
      expect(result.current.response).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    test('send() makes request and updates state', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({success: true}),
      });

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'POST:/test',
            initialData: {name: 'test'},
          },
          interceptors
        )
      );

      await act(async () => {
        await result.current.send();
      });

      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/test', expect.objectContaining({method: 'POST'}));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.response).toBeDefined();
    });

    test('send() with overrides merges data', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({success: true}),
      });

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'POST:/test',
            initialData: {name: 'test', age: 25},
          },
          interceptors
        )
      );

      await act(async () => {
        await result.current.send({age: 30});
      });

      // Should send merged data
      const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(sentBody).toEqual({name: 'test', age: 30});
    });

    test('handles errors correctly', async () => {
      const error = new Error('Network error');
      global.fetch.mockRejectedValueOnce(error);

      const onError = jest.fn();
      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            onError,
          },
          interceptors
        )
      );

      await act(async () => {
        try {
          await result.current.send();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.error).toBe(error);
      expect(result.current.isLoading).toBe(false);
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('Data mutations', () => {
    test('updateData() updates single field', () => {
      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            initialData: {name: 'test', age: 25},
          },
          interceptors
        )
      );

      act(() => {
        result.current.updateData('age', 30);
      });

      expect(result.current.data).toEqual({name: 'test', age: 30});
    });

    test('setData() replaces entire data object', () => {
      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            initialData: {name: 'test'},
          },
          interceptors
        )
      );

      act(() => {
        result.current.setData({completely: 'new'});
      });

      expect(result.current.data).toEqual({completely: 'new'});
    });

    test('handleDataChange() returns change handler', () => {
      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            initialData: {name: 'test'},
          },
          interceptors
        )
      );

      act(() => {
        const handler = result.current.handleDataChange('name');
        handler('updated');
      });

      expect(result.current.data.name).toBe('updated');
    });
  });

  describe('Lifecycle callbacks', () => {
    test('onSuccess called on successful request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({data: 'test'}),
      });

      const onSuccess = jest.fn();
      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            onSuccess,
          },
          interceptors
        )
      );

      await act(async () => {
        await result.current.send();
      });

      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ok: true}));
    });

    test('filterData transforms data before send', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const filterData = jest.fn((data) => ({...data, filtered: true}));

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'POST:/test',
            initialData: {name: 'test'},
            filterData,
          },
          interceptors
        )
      );

      await act(async () => {
        await result.current.send();
      });

      expect(filterData).toHaveBeenCalledWith({name: 'test'});
      const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(sentBody.filtered).toBe(true);
    });

    test('validateData can abort send', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const validateData = jest.fn(() => false);

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            validateData,
          },
          interceptors
        )
      );

      await act(async () => {
        await result.current.send();
      });

      expect(validateData).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Data validation failed, aborting send'));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    test('onDataChanged called when data updates', () => {
      const onDataChanged = jest.fn();

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            initialData: {count: 1},
            onDataChanged,
          },
          interceptors
        )
      );

      act(() => {
        result.current.updateData('count', 2);
      });

      expect(onDataChanged).toHaveBeenCalledWith({count: 1}, {count: 2});
    });
  });

  describe('Reset and abort', () => {
    test('reset() clears state', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({data: 'test'}),
      });

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
            initialData: {name: 'initial'},
          },
          interceptors
        )
      );

      await act(async () => {
        result.current.updateData('name', 'changed');
        await result.current.send();
      });

      expect(result.current.data.name).toBe('changed');
      expect(result.current.response).toBeDefined();

      await act(async () => {
        await result.current.reset();
      });

      expect(result.current.data).toEqual({name: 'initial'});
      expect(result.current.response).toBeNull();
      expect(result.current.error).toBeNull();
    });

    test('abort() cancels ongoing request', async () => {
      global.fetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
          },
          interceptors
        )
      );

      act(() => {
        result.current.send();
      });

      await act(async () => {
        await result.current.abort('manual');
      });

      // Request should be aborted
      expect(result.current.request).toBeDefined();
    });
  });

  describe('Interceptor integration', () => {
    test('accepts external interceptor manager', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({data: 'test'}),
      });

      const beforeSendSpy = jest.fn((data) => data);

      interceptors.add('beforeSend', beforeSendSpy);

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'POST:/test',
            initialData: {foo: 'bar'},
          },
          interceptors
        )
      );

      await act(async () => {
        await result.current.send();
      });

      expect(beforeSendSpy).toHaveBeenCalledWith({foo: 'bar'}, expect.objectContaining({data: {foo: 'bar'}}));
    });

    test('runs onMount hook', async () => {
      const onMountSpy = jest.fn();

      interceptors.add('onMount', onMountSpy);

      renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
          },
          interceptors
        )
      );

      // Wait for effect
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(onMountSpy).toHaveBeenCalled();
    });
  });

  describe('Concurrent request handling', () => {
    test('prevents concurrent requests', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ok: true, json: async () => ({})}), 100)));

      const {result} = renderHook(() =>
        useBaseApi(
          {
            client,
            url: 'GET:/test',
          },
          interceptors
        )
      );

      // Start first request
      await act(async () => {
        result.current.send();
        await new Promise((resolve) => setTimeout(resolve, 10)); // Let isLoading update
      });

      expect(result.current.isLoading).toBe(true);

      // Try to start second request while first is in progress
      await act(async () => {
        await result.current.send(); // Second call should be ignored
      });

      // Wait for first request to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Only one fetch should have been made
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Request already in progress'));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });
  });
});
