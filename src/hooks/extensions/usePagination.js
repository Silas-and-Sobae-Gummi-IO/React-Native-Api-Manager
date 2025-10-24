import {useState, useRef, useEffect, useCallback} from 'react';

/**
 * usePagination - Self-contained extension for pagination/infinite scroll
 *
 * Manages its own state and registers interceptors with the base API.
 * Returns empty object if config is null/undefined.
 *
 * @param {Object} interceptors - InterceptorManager instance from base API
 * @param {Object} baseApi - Base API object (for accessing send, data, etc)
 * @param {Object|null} config - Pagination config (null to disable)
 * @param {string} config.pageKey - Data key for page number (default: 'page')
 * @param {Function} config.getNextPageData - Get data for next page: (currentData, lastResponse) => dataOverrides
 * @param {Function} config.hasMoreFn - Function to determine if more data exists (response) => boolean
 * @param {Function} config.extractResults - Function to extract results array from response (response) => array
 * @param {Function} config.shouldReplace - Determine if results should be replaced: (context) => boolean
 * @param {Function} config.onLoadMore - Optional callback when loadMore is triggered
 * @returns {Object} Pagination state and methods (empty if not configured)
 */
export function usePagination(interceptors, baseApi, config) {
  // Return empty if not configured
  if (!config) return {};

  const {
    pageKey = 'page',
    getNextPageData = (currentData) => ({...currentData, [pageKey]: (currentData[pageKey] || 1) + 1}),
    // @TODO need to test this
    getResetData = (currentData) => ({...currentData, [pageKey]: 1}),
    hasMoreFn = () => true,
    extractResults = (response) => response?.data || response || [],
    shouldReplace = (context) => context.results.length === 0,
    onLoadMore,
  } = config;

  // Use baseApi.result for accumulated results
  // Keep local state as fallback for non-persist usage
  const results = baseApi.result || [];

  // Ensure result is initialized as empty array if null
  useEffect(() => {
    if (baseApi.result === null) {
      baseApi.updateResult([]);
    }
  }, []);

  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Track last response for cursor pagination
  const lastResponseRef = useRef(null);

  // Track if we're in a refresh/reset state
  const isResetRef = useRef(false);

  /**
   * Load more data (get next page and append results)
   */
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    onLoadMore?.();

    try {
      // Run pagination:beforeLoadMore hooks
      await interceptors.run('pagination:beforeLoadMore', undefined, {
        currentData: baseApi.data,
        lastResponse: lastResponseRef.current,
      });

      // Get next page data (supports cursor pagination)
      const nextPageData = getNextPageData(baseApi.data, lastResponseRef.current);

      // Send request with page overrides (doesn't trigger onDataChanged)
      const response = await baseApi.send(nextPageData);

      // Run pagination:afterLoadMore hooks
      await interceptors.run('pagination:afterLoadMore', response, {
        nextPageData,
      });

      setIsLoadingMore(false);
      return response;
    } catch (err) {
      setIsLoadingMore(false);
      throw err;
    }
  }, [isLoadingMore, hasMore, interceptors, baseApi, config]);

  /**
   * Reset pagination state
   */
  const resetPagination = useCallback(() => {
    baseApi.updateResult([]);
    setHasMore(true);
    setIsLoadingMore(false);
    lastResponseRef.current = null;
    isResetRef.current = true; // Mark as reset
  }, [baseApi.updateResult]);

  // After send: accumulate results
  interceptors.replace(
    'filterData',
    'pagination:filterData',
    (parsedData, context) => {
      // Store last response for cursor pagination
      lastResponseRef.current = parsedData;

      // Extract new results
      const newResults = extractResults(parsedData);

      // Get current results directly (not from closure)
      const currentResults = baseApi.result || [];

      // Decide whether to replace or append
      // Always replace if we just reset
      const replace = isResetRef.current || shouldReplace({results: currentResults, response: parsedData, context});

      // Clear reset flag after first filter
      if (isResetRef.current) {
        isResetRef.current = false;
      }

      if (replace) {
        return newResults;
      } else {
        return [...currentResults, ...newResults];
      }
    },
    10
  );

  interceptors.replace(
    'afterSend',
    'pagination:afterSend',
    ({response}) => {
      const moreAvailable = hasMoreFn(response);
      setHasMore(moreAvailable);
    },
    10
  );

  // Interceptor for `beforeReset`
  interceptors.replace(
    'beforeReset',
    'pagination:beforeReset',
    () => {
      resetPagination();
    },
    10
  );

  // Before refresh: reset pagination (back to page 1)
  interceptors.replace(
    'refresh:beforeSend',
    'pagination:resetOnRefresh',
    () => {
      resetPagination();
    },
    10
  );

  interceptors.replace(
    'refresh:overwriteData',
    'pagination:overwriteData',
    (overrides) => {
      return getResetData(overrides);
    },
    10
  );

  interceptors.replace('persist:onStoreUpdated', 'pagination:onStoreUpdated', ({store, dataKey, response}) => {
    if (store.update && dataKey) {
      store.update(dataKey, {hasMore: hasMoreFn(response)});
    }
  });

  return {
    // Pagination state
    results,
    hasMore,
    isLoadingMore,

    // Pagination methods
    loadMore,
    resetPagination,
  };
}
