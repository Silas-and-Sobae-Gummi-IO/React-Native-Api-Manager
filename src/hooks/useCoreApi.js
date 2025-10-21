import {useBaseApi} from './useBaseApi';
// Extensions will be imported here as they're implemented
// import {usePagination} from './extensions/pagination';
// import {useRefresh} from './extensions/refresh';

/**
 * useCoreApi - Public API hook with extension support
 * 
 * This is the main hook users interact with. It starts with useBaseApi
 * and conditionally applies extensions based on config.
 * 
 * @param {Object} config
 * @param {ApiClient} config.client - ApiClient instance
 * @param {string} config.url - Request URL (e.g., 'GET:/posts')
 * @param {Object} config.initialData - Initial/default data state
 * @param {Function} config.onSuccess - Success callback
 * @param {Function} config.onError - Error callback
 * @param {Object} config.pagination - Pagination extension config
 * @param {boolean} config.refresh - Enable refresh extension
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
  // Start with base API
  let api = useBaseApi(config);

  // Apply extensions conditionally based on config
  
  // Pagination extension
  // if (config.pagination) {
  //   api = usePagination(api, config.pagination);
  // }

  // Refresh extension
  // if (config.refresh) {
  //   api = useRefresh(api);
  // }

  return api;
}

// Export as useApi for convenience
export {useCoreApi as useApi};
