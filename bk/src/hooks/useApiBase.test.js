/**
 * @file Comprehensive tests for useApiBase hook
 * @author Alan Chen
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useApiBase } from './useApiBase';

// Mock API client
const mockApiClient = {
  request: jest.fn(),
  abort: jest.fn(),
};

// Mock global store
const mockGlobalStore = {
  use: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
};

describe('useApiBase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should throw error when apiManager is not provided', () => {
      // Use a function wrapper to catch the error during hook initialization
      expect(() => {
        renderHook(() => useApiBase({}));
      }).toThrow('useApiBase requires an `apiManager` instance to be provided in the options.');
    });

    it('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
        })
      );

      expect(result.current.response).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isInitialLoading).toBe(false);
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.isLoadingMore).toBe(false);
      expect(result.current.hasMore).toBe(false);
      expect(typeof result.current.send).toBe('function');
      expect(typeof result.current.refresh).toBe('function');
      expect(typeof result.current.setParams).toBe('function');
      expect(typeof result.current.updateParams).toBe('function');
    });

    it('should initialize with custom initial params', () => {
      const initialParams = { search: 'test', limit: 10 };
      
      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          initialParams,
        })
      );

      expect(result.current.params).toEqual(initialParams);
    });
  });

  describe('Request Execution', () => {
    it('should make API request when send is called', async () => {
      const mockResponse = { data: 'test response' };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'post:test-endpoint',
        expect.objectContaining({
          body: {},
        })
      );
      expect(result.current.response).toEqual(mockResponse);
    });

    it('should handle API request errors', async () => {
      const mockError = new Error('API Error');
      mockApiClient.request.mockRejectedValue(mockError);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.error).toBe(mockError);
      expect(result.current.response).toBeNull();
    });

    it('should call onSuccess callback on successful request', async () => {
      const mockResponse = { data: 'success' };
      const onSuccess = jest.fn();
      mockApiClient.request.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          onSuccess,
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(onSuccess).toHaveBeenCalledWith(mockResponse, {});
    });

    it('should call onError callback on failed request', async () => {
      const mockError = new Error('API Error');
      const onError = jest.fn();
      mockApiClient.request.mockRejectedValue(mockError);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          onError,
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(onError).toHaveBeenCalledWith(mockError);
    });
  });

  describe('Loading States', () => {
    it('should manage initial loading state', async () => {
      let resolveRequest;
      const requestPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });
      mockApiClient.request.mockReturnValue(requestPromise);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
        })
      );

      // Start request
      act(() => {
        result.current.send();
      });

      expect(result.current.isInitialLoading).toBe(true);
      expect(result.current.isLoading).toBe(true);

      // Resolve request
      await act(async () => {
        resolveRequest({ data: 'test' });
        await requestPromise;
      });

      expect(result.current.isInitialLoading).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it('should manage refresh loading state', async () => {
      let resolveRequest;
      const requestPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });
      mockApiClient.request.mockReturnValue(requestPromise);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
        })
      );

      // Start refresh
      act(() => {
        result.current.refresh();
      });

      expect(result.current.isRefreshing).toBe(true);
      expect(result.current.isLoading).toBe(true);

      // Resolve request
      await act(async () => {
        resolveRequest({ data: 'test' });
        await requestPromise;
      });

      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Parameters Management', () => {
    it('should update params with setParams', () => {
      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          initialParams: { search: 'initial' },
        })
      );

      act(() => {
        result.current.setParams({ search: 'updated', limit: 10 });
      });

      expect(result.current.params).toEqual({
        search: 'updated',
        limit: 10,
      });
    });

    it('should merge params with updateParams', () => {
      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          initialParams: { search: 'initial', page: 1 },
        })
      );

      act(() => {
        result.current.updateParams({ search: 'updated' });
      });

      expect(result.current.params).toEqual({
        search: 'updated',
        page: 1,
      });
    });

    it('should handle controlled params', () => {
      const controlledParams = { search: 'controlled' };
      
      const { result, rerender } = renderHook(
        ({ params }) => useApiBase({
          apiManager: mockApiClient,
          params,
        }),
        {
          initialProps: { params: controlledParams },
        }
      );

      expect(result.current.params).toEqual(controlledParams);

      const newParams = { search: 'new controlled' };
      rerender({ params: newParams });

      expect(result.current.params).toEqual(newParams);
    });
  });

  describe('Run On Mount', () => {
    it.skip('should run request on mount when runOnMount is true', async () => {
      mockApiClient.request.mockResolvedValue({ data: 'mount response' });

      renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          runOnMount: true,
        })
      );

      // Use a simple timeout to allow the effect to run
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockApiClient.request).toHaveBeenCalled();
    });

    it('should not run request on mount when runOnMount is false', () => {
      renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          runOnMount: false,
        })
      );

      expect(mockApiClient.request).not.toHaveBeenCalled();
    });
  });

  describe('Debouncing', () => {
    it.skip('should debounce requests when runOnParamsChange is set', async () => {
      mockApiClient.request.mockResolvedValue({ data: 'response' });

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          runOnParamsChange: 300,
          initialParams: { search: '' },
        })
      );

      // Trigger initial request to set hasFetchedOnce
      await act(async () => {
        await result.current.send();
      });

      jest.clearAllMocks();

      // Multiple rapid param changes
      act(() => {
        result.current.setParams({ search: 'a' });
      });

      act(() => {
        result.current.setParams({ search: 'ab' });
      });

      act(() => {
        result.current.setParams({ search: 'abc' });
      });

      // Should not have called request yet
      expect(mockApiClient.request).not.toHaveBeenCalled();

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Allow debounced function to execute
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now should have called request once
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    });
  });

  describe('Global Store Integration', () => {
    beforeEach(() => {
      mockGlobalStore.get.mockReturnValue(null);
      mockGlobalStore.use.mockReturnValue(null);
    });

    it('should use global store when provided', () => {
      renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          globalStore: mockGlobalStore,
          dataPath: 'test.data',
        })
      );

      expect(mockGlobalStore.use).toHaveBeenCalledWith('test.data');
    });

    it('should update global store on successful request', async () => {
      const mockResponse = { data: 'test' };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          globalStore: mockGlobalStore,
          dataPath: 'test.data',
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(mockGlobalStore.update).toHaveBeenCalledWith('test.data', mockResponse);
    });

    it('should fall back to local state without global store', async () => {
      const mockResponse = { data: 'local' };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.response).toBe(mockResponse);
    });
  });

  describe('Pagination', () => {
    const mockPaginationConfig = {
      getResults: (response) => response.items,
      getMetadata: (response) => ({
        page: response.page,
        hasMore: response.hasMore,
      }),
      merge: (existing, newResults, page) => {
        if (page === 1) return newResults;
        return [...(existing || []), ...newResults];
      },
    };

    it('should handle pagination requests', async () => {
      const mockResponse = {
        items: ['item1', 'item2'],
        page: 1,
        hasMore: true,
      };
      mockApiClient.request.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          pagination: mockPaginationConfig,
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.response).toEqual({
        results: ['item1', 'item2'],
        metadata: { page: 1, hasMore: true },
      });
      expect(result.current.hasMore).toBe(true);
    });

    it('should load more pages with loadMore', async () => {
      const mockResponse1 = {
        items: ['item1', 'item2'],
        page: 1,
        hasMore: true,
      };
      const mockResponse2 = {
        items: ['item3', 'item4'],
        page: 2,
        hasMore: false,
      };

      mockApiClient.request
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          pagination: mockPaginationConfig,
        })
      );

      // First page
      await act(async () => {
        await result.current.send();
      });

      expect(result.current.response.results).toEqual(['item1', 'item2']);
      expect(result.current.hasMore).toBe(true);

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.response.results).toEqual([
        'item1', 'item2', 'item3', 'item4'
      ]);
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('Lifecycle Management', () => {
    it('should call abort on unmount when abortOnUnmount is true', () => {
      const { unmount } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          abortOnUnmount: true,
        })
      );

      unmount();

      expect(mockApiClient.abort).toHaveBeenCalled();
    });

    it('should not call abort on unmount when abortOnUnmount is false', () => {
      const { unmount } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          abortOnUnmount: false,
        })
      );

      unmount();

      expect(mockApiClient.abort).not.toHaveBeenCalled();
    });
  });

  describe('Focus/Blur Handlers', () => {
    it('should provide focus handler that refreshes when runOnFocus is true', async () => {
      mockApiClient.request.mockResolvedValue({ data: 'focused' });

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          runOnFocus: true,
        })
      );

      // Simulate that we've fetched once
      await act(async () => {
        await result.current.send();
      });

      jest.clearAllMocks();

      // Call focus handler
      await act(async () => {
        result.current.focus();
      });

      expect(mockApiClient.request).toHaveBeenCalled();
    });

    it('should provide blur handler that aborts when abortOnBlur is true', () => {
      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          abortOnBlur: true,
        })
      );

      act(() => {
        result.current.blur();
      });

      expect(mockApiClient.abort).toHaveBeenCalled();
    });
  });

  describe('Parameter Validation', () => {
    it('should not make request when validateParams returns false', async () => {
      const validateParams = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          validateParams,
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(validateParams).toHaveBeenCalledWith({});
      expect(mockApiClient.request).not.toHaveBeenCalled();
    });

    it('should make request when validateParams returns true', async () => {
      const validateParams = jest.fn().mockReturnValue(true);
      mockApiClient.request.mockResolvedValue({ data: 'valid' });

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          validateParams,
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(validateParams).toHaveBeenCalledWith({});
      expect(mockApiClient.request).toHaveBeenCalled();
    });
  });

  describe('Data Filtering', () => {
    it('should filter params before sending request', async () => {
      const filterParams = jest.fn((params) => ({ ...params, filtered: true }));
      mockApiClient.request.mockResolvedValue({ data: 'filtered' });

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          initialParams: { search: 'test' },
          filterParams,
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(filterParams).toHaveBeenCalledWith({ search: 'test' });
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'post:test-endpoint',
        expect.objectContaining({
          body: { search: 'test', filtered: true },
        })
      );
    });

    it('should filter response data', async () => {
      const filterResponse = jest.fn((data) => ({ ...data, filtered: true }));
      mockApiClient.request.mockResolvedValue({ data: 'original' });

      const { result } = renderHook(() =>
        useApiBase({
          apiManager: mockApiClient,
          uri: 'test-endpoint',
          filterResponse,
        })
      );

      await act(async () => {
        await result.current.send();
      });

      expect(filterResponse).toHaveBeenCalledWith({ data: 'original' });
      expect(result.current.response).toEqual({
        data: 'original',
        filtered: true,
      });
    });
  });
});