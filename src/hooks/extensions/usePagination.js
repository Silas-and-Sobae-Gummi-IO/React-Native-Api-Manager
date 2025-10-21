import {useState, useRef, useEffect} from 'react';

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
    getNextPageData = (currentData) => ({[pageKey]: (currentData[pageKey] || 1) + 1}),
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

  /**
   * Load more data (get next page and append results)
   */
  const loadMore = async () => {
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
  };

  /**
   * Reset pagination state
   */
  const resetPagination = () => {
    baseApi.updateResult([]);
    setHasMore(true);
    setIsLoadingMore(false);
    lastResponseRef.current = null;
  };

  // Register interceptors for pagination lifecycle
  useEffect(() => {
    // After send: accumulate results
    interceptors.add('afterSend', 'pagination:afterSend', (parsedData, context) => {
      // Store last response for cursor pagination
      lastResponseRef.current = parsedData;

      // Extract new results
      const newResults = extractResults(parsedData);

      // Decide whether to replace or append
      const replace = shouldReplace({results, response: parsedData, context});

      if (replace) {
        baseApi.updateResult(newResults);
      } else {
        baseApi.updateResult([...results, ...newResults]);
      }

      // Update hasMore status
      const moreAvailable = hasMoreFn(parsedData);
      setHasMore(moreAvailable);
    }, 10);

    // Before reset: clear pagination state
    interceptors.add('beforeReset', 'pagination:beforeReset', () => {
      resetPagination();
    }, 10);

    // Before refresh: reset pagination (back to page 1)
    interceptors.add('refresh:beforeSend', 'pagination:resetOnRefresh', () => {
      resetPagination();
    }, 10);

    // Cleanup on unmount
    return () => {
      interceptors.remove('afterSend', 'pagination:afterSend');
      interceptors.remove('beforeReset', 'pagination:beforeReset');
      interceptors.remove('refresh:beforeSend', 'pagination:resetOnRefresh');
    };
  }, [results]); // Re-register when results change (for shouldReplace check)

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
