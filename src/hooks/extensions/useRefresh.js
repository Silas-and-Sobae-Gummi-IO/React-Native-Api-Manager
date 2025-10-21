import {useState} from 'react';

/**
 * useRefresh - Self-contained extension for pull-to-refresh
 * 
 * Manages its own state (isRefreshing) and provides refresh method.
 * Returns empty object if config is null/undefined.
 * 
 * @param {Object} interceptors - InterceptorManager instance (unused for now)
 * @param {Object} baseApi - Base API object for accessing send/reset
 * @param {Object|null} config - Refresh config (null to disable)
 * @param {Function} config.onRefresh - Optional callback when refresh is triggered
 * @returns {Object} Refresh state and methods (empty if not configured)
 */
export function useRefresh(interceptors, baseApi, config) {
  // Return empty if not configured
  if (!config) return {};

  const {onRefresh} = config;

  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Refresh - reload data (pull-to-refresh pattern)
   * @param {boolean} resetData - Whether to reset data state before refresh (default: false)
   */
  const refresh = async (resetData = false) => {
    setIsRefreshing(true);
    
    // Call onRefresh hook if provided
    onRefresh?.();

    try {
      // Run refresh:beforeSend hooks (other extensions can react)
      await interceptors.run('refresh:beforeSend', undefined, {resetData});

      // Optionally reset data state
      if (resetData) {
        baseApi.reset();
      }

      // Send request with current data
      const result = await baseApi.send();

      // Run refresh:afterSend hooks
      await interceptors.run('refresh:afterSend', result, {resetData});
      
      setIsRefreshing(false);
      return result;
    } catch (err) {
      setIsRefreshing(false);
      throw err;
    }
  };

  return {
    isRefreshing,
    refresh,
  };
}
