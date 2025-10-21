import {useRef} from 'react';
import {InterceptorManager} from '../client/lib/InterceptorManager';
import {useBaseApi} from './useBaseApi';
import {useRefresh} from './extensions/useRefresh';
import {usePagination} from './extensions/usePagination';
import {useAutoFetch} from './extensions/useAutoFetch';

/**
 * useCoreApi - Public API hook with extension support
 * 
 * This is the main hook users interact with. It starts with useBaseApi
 * and applies extensions through hook registration (order-independent).
 * 
 * Extensions register hooks with the base API instead of wrapping it,
 * making composition cleaner and avoiding method override conflicts.
 * 
 * @param {Object} config
 * @param {ApiClient} config.client - ApiClient instance (required)
 * @param {string} config.url - Request URL in format 'METHOD:/path'
 * @param {Object} config.initialData - Initial/default data state
 * @param {Function} config.onSuccess - Success callback
 * @param {Function} config.onError - Error callback
 * @param {Object} config.pagination - Pagination extension config (optional)
 * @param {Object|boolean} config.refresh - Refresh extension config (optional). Pass true or {onRefresh}
 * @param {Object|boolean} config.autoFetch - Auto-fetch extension config (optional). Pass true or {enabled, fetchData}
 * @param {Object} config.extensions - User-defined extensions {extensionName: useExtensionHook}
 * @param {Object} config.* - Any other config is passed to ApiClient and extensions
 * 
 * @returns {Object} API state and methods (with extensions if configured)
 * 
 * @example
 * // Basic usage
 * const api = useCoreApi({
 *   client: apiClient,
 *   url: 'GET:/posts',
 *   initialData: { category: 'tech' }
 * });
 * 
 * @example
 * // With pagination
 * const api = useCoreApi({
 *   client: apiClient,
 *   url: 'GET:/posts',
 *   initialData: { page: 1 },
 *   pagination: {
 *     hasMoreFn: (response) => response.hasMore
 *   }
 * });
 * 
 * @example
 * // With refresh
 * const api = useCoreApi({
 *   client: apiClient,
 *   url: 'GET:/posts',
 *   refresh: true
 * });
 * 
 * @example
 * // With custom extensions
 * const api = useCoreApi({
 *   client: apiClient,
 *   url: 'GET:/posts',
 *   extensions: {
 *     analytics: useAnalyticsExtension,
 *     retry: useRetryExtension
 *   },
 *   analytics: {tracker: myTracker},
 *   retry: {maxAttempts: 3}
 * });
 */
export function useCoreApi(config) {
  // Built-in extensions registry
  const builtInExtensions = {
    pagination: usePagination,
    refresh: useRefresh,
    autoFetch: useAutoFetch,
  };

  // Merge with user extensions
  const allExtensions = {
    ...builtInExtensions,
    ...(config.extensions || {}),
  };

  // Create interceptor manager for extensions
  const interceptorsRef = useRef(new InterceptorManager());
  const interceptors = interceptorsRef.current;

  // Create base API first with shared interceptors
  const baseApi = useBaseApi(config, interceptors);

  // Apply all extensions (called unconditionally via map)
  const extensionResults = Object.entries(allExtensions).map(([key, useExtension]) => {
    // Get extension-specific config from root config
    const extensionConfig = config[key];

    // Normalize boolean configs to objects
    const normalizedConfig = 
      typeof extensionConfig === 'boolean' 
        ? (extensionConfig ? {} : null)
        : extensionConfig;

    // Call extension hook
    return useExtension(interceptors, baseApi, normalizedConfig);
  });

  // Merge all state and methods
  return {
    ...baseApi,
    ...Object.assign({}, ...extensionResults),
  };
}
