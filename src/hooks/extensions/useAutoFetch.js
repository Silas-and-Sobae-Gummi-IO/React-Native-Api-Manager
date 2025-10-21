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
 * @param {boolean} config.runOnMount - Whether to run fetch on mount (default: true)
 * @param {boolean} config.abortOnUnmount - Whether to abort request on unmount (default: false)
 * @param {Function} config.condition - Optional condition check before fetch (context) => boolean
 * @param {Object} config.fetchData - Optional data overrides for initial fetch
 * @param {Function} config.onAutoFetch - Optional callback when auto-fetch triggers
 * @returns {Object} Empty object (no additional state/methods)
 */
export function useAutoFetch(interceptors, baseApi, config) {
  // Return empty if not configured
  if (!config) return {};

  const {
    enabled = true,
    runOnMount = true,
    abortOnUnmount = false,
    condition,
    fetchData = {},
    onAutoFetch,
  } = config;

  // Register onMount hook to trigger send
  useEffect(() => {
    if (!enabled || !runOnMount) return;

    interceptors.add('onMount', 'autoFetch:onMount', async (context) => {
      // Check condition if provided
      if (condition && !condition(context)) {
        return;
      }

      // Trigger autoFetch:beforeFetch hook (other extensions can react)
      await interceptors.run('autoFetch:beforeFetch', undefined, {fetchData});

      // Call onAutoFetch callback
      onAutoFetch?.();
      
      // Trigger send with optional data overrides
      await baseApi.send(fetchData);

      // Trigger autoFetch:afterFetch hook
      await interceptors.run('autoFetch:afterFetch', undefined, {fetchData});
    }, 10);

    // Cleanup
    return () => {
      interceptors.remove('onMount', 'autoFetch:onMount');
    };
  }, [enabled, runOnMount]); // Re-register if enabled/runOnMount changes

  // Register onUnmount hook to abort if configured
  useEffect(() => {
    if (!abortOnUnmount) return;

    interceptors.add('onUnmount', 'autoFetch:onUnmount', async () => {
      baseApi.abort('unmount');
    }, 10);

    return () => {
      interceptors.remove('onUnmount', 'autoFetch:onUnmount');
    };
  }, [abortOnUnmount]);

  // No additional state or methods
  return {};
}
