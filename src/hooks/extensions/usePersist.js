import {useCallback} from 'react';

/**
 * usePersist - Store integration extension
 *
 * Connects API result/metadata to external reactive store (Zustand, Redux, etc).
 * Store becomes the reactive source of truth for UI rendering.
 *
 * Flow:
 * 1. Reads initial value from store (reactive via store.use hook)
 * 2. On API response, syncs data to store via filterData interceptor
 * 3. External store changes automatically reflect in UI (store reactivity)
 *
 * @param {Object} interceptors - InterceptorManager instance
 * @param {Object} baseApi - Base API object
 * @param {Object|null} config - Persist config (null to disable)
 * @param {Object} config.store - Store integration config
 * @param {Function} config.store.use - Hook to read from store: (key) => value
 * @param {Function} config.store.update - Function to write to store: (key, value) => void
 * @param {Function} config.store.useMeta - Hook to read metadata (optional): (key) => value
 * @param {Function} config.store.updateMeta - Function to write metadata (optional): (key, value) => void
 * @param {string} config.dataKey - Key for result data in store
 * @param {string} config.metaKey - Key for metadata in store (optional)
 * @param {Object} config.defaults - Default values for metadata (optional)
 * @returns {Object} Persisted state (overrides baseApi.result with store value)
 *
 * @example
 * // With Zustand
 * const useStore = create((set) => ({
 *   posts: [],
 *   setPosts: (posts) => set({posts})
 * }));
 *
 * const api = useCoreApi({
 *   url: 'GET:/posts',
 *   persist: {
 *     store: {
 *       use: () => useStore(state => state.posts),
 *       update: (key, value) => useStore.getState().setPosts(value)
 *     },
 *     dataKey: 'posts'
 *   }
 * });
 */
export function usePersist(interceptors, baseApi, config) {
  // Return empty if not configured
  if (!config) return {};

  const {store, dataKey, metaKey, defaults = {}} = config;

  // Read from store (reactive - this is the key!)
  // When store updates elsewhere, this hook re-renders automatically
  const storeResult = store.use ? store.use(dataKey) : null;
  const storeMeta = store.useMeta && metaKey ? store.useMeta(metaKey) : null;

  // Sync API responses to store via filterData interceptor
  interceptors.replace('afterSend', 'persist:syncToStore', async (context) => {
    // Write response data to store
    if (store.update && dataKey) {
      store.update(dataKey, context.filteredData);
    }

    await interceptors.run('persist:onStoreUpdated', undefined, {
      ...context,
      persistConfig: config,
      store,
    });
  });

  // Return overrides - store value replaces baseApi.result
  return {
    result: storeResult, // This overrides baseApi.result (reactive!)
    ...(storeMeta && {meta: storeMeta}), // Optional metadata
  };
}
