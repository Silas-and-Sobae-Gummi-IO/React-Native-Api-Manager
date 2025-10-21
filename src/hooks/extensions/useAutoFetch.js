import {useEffect} from 'react';

/**
 * useAutoFetch - Self-contained extension for automatic fetching on mount
 * 
 * Automatically triggers send() when the component mounts.
 * Useful for data that should load immediately.
 * 
 * @param {Object} interceptors - InterceptorManager instance
 * @param {Object} baseApi - Base API object for accessing send
 * @param {Object|null} config - AutoFetch config (null to disable)
 * @param {boolean} config.enabled - Whether auto-fetch is enabled (default: true)
 * @param {Object} config.fetchData - Optional data overrides for initial fetch
 * @param {Function} config.onAutoFetch - Optional callback when auto-fetch triggers
 * @returns {Object} Empty object (no additional state/methods)
 */
export function useAutoFetch(interceptors, baseApi, config) {
  // Return empty if not configured
  if (!config) return {};

  const {
    enabled = true,
    fetchData = {},
    onAutoFetch,
  } = config;

  // Register onMount hook to trigger send
  useEffect(() => {
    if (!enabled) return;

    interceptors.add('onMount', 'autoFetch:onMount', async (context) => {
      onAutoFetch?.();
      
      // Trigger send with optional data overrides
      await baseApi.send(fetchData);
    }, 10);

    // Cleanup
    return () => {
      interceptors.remove('onMount', 'autoFetch:onMount');
    };
  }, [enabled]); // Re-register if enabled changes

  // No additional state or methods
  return {};
}
