import {useBaseApi} from './useBaseApi';
// Extensions will be imported here as they're implemented
// import {usePaginationWrapper} from './extensions/pagination';
// import {useRefreshWrapper} from './extensions/refresh';

/**
 * useCoreApi - Public API hook with extension support
 * 
 * This is the main hook users interact with. It starts with useBaseApi
 * and applies extension wrappers that enhance functionality.
 * 
 * Extension wrappers are ALWAYS called (to satisfy React hooks rules),
 * but only activate if their config is provided.
 * 
 * @param {Object} config
 * @param {ApiClient} config.client - ApiClient instance (required)
 * @param {string} config.url - Request URL in format 'METHOD:/path'
 * @param {Object} config.initialData - Initial/default data state
 * @param {Function} config.onSuccess - Success callback
 * @param {Function} config.onError - Error callback
 * @param {Object} config.pagination - Pagination extension config (optional)
 * @param {boolean} config.refresh - Enable refresh extension (optional)
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
  // Start with base API
  let api = useBaseApi(config);

  // Apply extension wrappers (ALWAYS called to satisfy hooks rules)
  // Each wrapper checks if its config exists and returns enhanced or original API
  
  // Pagination extension wrapper
  // api = usePaginationWrapper(api, config.pagination);

  // Refresh extension wrapper
  // api = useRefreshWrapper(api, config.refresh);

  return api;
}

// Export as useApi for convenience
export {useCoreApi as useApi};
