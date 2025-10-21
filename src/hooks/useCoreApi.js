import {useRef} from 'react';
import {InterceptorManager} from '../client/lib/InterceptorManager';
import {useBaseApi} from './useBaseApi';
import {useRefresh} from './extensions/useRefresh';
import {usePagination} from './extensions/usePagination';

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
 * @param {Object} config.* - Any other config is passed to ApiClient
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
 */
export function useCoreApi(config) {
  const {refresh: refreshConfig, pagination: paginationConfig, ...baseConfig} = config;

  // Create interceptor manager for extensions
  const interceptorsRef = useRef(new InterceptorManager());
  const interceptors = interceptorsRef.current;

  // Create base API first with shared interceptors
  const baseApi = useBaseApi(baseConfig, interceptors);

  // Call extension hooks unconditionally (pass null if not configured)
  // Extensions manage their own state and register interceptors
  const paginationExt = usePagination(interceptors, baseApi, paginationConfig);
  const refreshExt = useRefresh(
    interceptors,
    baseApi,
    typeof refreshConfig === 'object' ? refreshConfig : refreshConfig ? {} : null
  );

  // Merge all state and methods
  return {
    ...baseApi,
    ...paginationExt,
    ...refreshExt,
  };
}

// Export as useApi for convenience
export {useCoreApi as useApi};
