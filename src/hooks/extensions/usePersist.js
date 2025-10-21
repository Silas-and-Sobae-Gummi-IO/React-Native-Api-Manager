import {useEffect, useMemo, useCallback} from 'react';

/**
 * usePersist - Store integration extension
 * 
 * Connects API result/metadata to external reactive store.
 * Store becomes source of truth for UI rendering.
 * 
 * @param {Object} interceptors - InterceptorManager instance
 * @param {Object} baseApi - Base API object
 * @param {Object|null} config - Persist config
 * @param {Object} config.store - Store integration config
 * @param {Function} config.store.use - Hook to read from store
 * @param {Function} config.store.update - Function to write to store
 * @param {Function} config.store.fetchMeta - Hook to read metadata (optional)
 * @param {Function} config.store.updateMeta - Function to write metadata (optional)
 * @param {string} config.dataKey - Key for result data in store
 * @param {string} config.metaKey - Key for metadata in store (optional)
 * @param {Object} config.defaults - Default values for metadata
 * @returns {Object} Persisted state (overrides baseApi.result)
 */
export function usePersist(interceptors, baseApi, config) {
  if (!config) return {};

  const {
    store,
    dataKey,
    metaKey,
    defaults = {},
  } = config;

  // Read from store (reactive)
  const result = store.use ? store.use() : null;
  const meta = store.fetchMeta && metaKey ? store.fetchMeta(metaKey) : null;

  // Override baseApi._updateResultRef to write to store
  useEffect(() => {
    if (!baseApi._updateResultRef) return;

    const originalUpdateResult = baseApi._updateResultRef.current;
    
    // Override with store-aware implementation
    baseApi._updateResultRef.current = (newResult) => {
      // Write to external store
      if (store.update) {
        store.update(newResult);
      }
      // Also update local state as fallback
      originalUpdateResult(newResult);
    };

    // Cleanup: restore original
    return () => {
      if (baseApi._updateResultRef) {
        baseApi._updateResultRef.current = originalUpdateResult;
      }
    };
  }, [baseApi, store]);

  // After send: sync to store
  useEffect(() => {
    const hookId = 'persist:sync';
    
    interceptors.add('afterSend', hookId, (parsedData) => {
      // baseApi.updateResult already called by useBaseApi.send()
      // Just update metadata if needed
      if (metaKey && store.updateMeta) {
        const currentMeta = meta || {};
        store.updateMeta(metaKey, {
          ...defaults,
          ...currentMeta,
        });
      }
      return parsedData;
    }, 5); // Priority 5 - run before pagination

    return () => interceptors.remove('afterSend', hookId);
  }, [interceptors, metaKey, store, meta, defaults]);

  // Return overrides for baseApi
  return {
    result, // From store (reactive)
    // Expose metadata if available
    ...(meta && {meta}),
  };
}
