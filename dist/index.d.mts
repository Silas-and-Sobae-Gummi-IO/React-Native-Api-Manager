import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * A unified and flexible hook for handling API requests, local state, and global store synchronization.
 * @param {object} options - The configuration options for the hook.
 * @param {object} options.apiManager - A required instance of your API client.
 * @returns {object} The API state and methods.
 */
const useApi = (options = {}) => {
  // Ensure apiManager is provided
  if (!options.apiManager) {
    throw new Error('useApi requires an `apiManager` instance to be provided in the options.');
  }

  const settings = {
    // --- Core ---
    uri: '',
    initialParams: {},
    // --- Global Store ---
    globalStore: null,
    dataPath: '',
    // --- Triggers ---
    runOnMount: false,
    alwaysRunOnMount: false,
    runOnFocus: false,
    runOnParamsChange: false,
    refreshDependencies: [],
    // --- Lifecycle & Validation ---
    validateParams: () => true,
    abortOnUnmount: true,
    abortOnBlur: true,
    // --- Data Transformation ---
    filterParams: params => params,
    filterResponse: data => data,
    // --- Callbacks ---
    onSubmit: () => {},
    onSuccess: () => {},
    onError: () => {},
    onCompleted: () => {},
    onRefresh: () => {},
    // --- Pagination ---
    pagination: null,
    ...options,
  };

  // --- State Management ---
  const [params, setParams] = useState(settings.initialParams);
  const [error, setError] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingStates, setLoadingStates] = useState({
    isInitialLoading: settings.runOnMount,
    isRefreshing: false,
    isLoadingMore: false,
  });

  // --- Refs ---
  const apiRequest = useRef(settings.apiManager); // Use the injected manager
  const lastFetchTimestamp = useRef(0);
  const hasFetchedOnce = useRef(false);
  const isMounted = useRef(true);
  const debounceTimer = useRef(null);
  const previousParams = useRef(params);

  // --- Global Store Integration ---
  const localResponseState = useState(settings.pagination ? {results: []} : null);
  const hasGlobalStore = !!(settings.globalStore && settings.dataPath);
  const response = hasGlobalStore ? settings.globalStore.use(settings.dataPath) : localResponseState[0];
  const setResponse = hasGlobalStore
    ? (value, ...args) => settings.globalStore.update(settings.dataPath, value, ...args)
    : localResponseState[1];

  useEffect(() => {
    if (hasGlobalStore) {
      const existingData = settings.globalStore.get(settings.dataPath);
      if (existingData) {
        setLoadingStates(prev => ({...prev, isInitialLoading: false}));
      }
    }
  }, [hasGlobalStore, settings.globalStore, settings.dataPath]);

  // --- Core Request Logic ---
  const send = useCallback(
    async (mode = 'initial', oneTimeParams = {}) => {
      if (loadingStates.isInitialLoading || loadingStates.isRefreshing) {
        if (mode !== 'pagination' || !settings.pagination) return;
      }

      setLoadingStates(prev => ({
        ...prev,
        isInitialLoading: mode === 'initial' && !hasFetchedOnce.current,
        isRefreshing: mode === 'refresh',
        isLoadingMore: mode === 'pagination',
      }));
      setError(null);
      setErrorMessage('');

      const currentParams = {...params, ...oneTimeParams};
      if (mode === 'pagination' && settings.pagination) {
        const page = (hasGlobalStore ? settings.globalStore.get(settings.dataPath)?.metadata?.page : response?.metadata?.page) || 0;
        currentParams.page = page + 1;
      }
      const finalParams = settings.filterParams(currentParams);

      if (!settings.validateParams(finalParams)) {
        setLoadingStates({isInitialLoading: false, isRefreshing: false, isLoadingMore: false});
        return;
      }

      await settings.onSubmit();
      if (mode === 'refresh') await settings.onRefresh();

      const apiResponse = await apiRequest.current.sendJson(settings.uri, finalParams);

      if (!isMounted.current) return;

      if (!apiResponse || !apiResponse.success) {
        const err = apiResponse?.data || {message: 'An unknown error occurred.'};
        setError(err);
        setErrorMessage(err.message);
        await settings.onError(err);
      } else {
        const filteredData = settings.filterResponse(apiResponse.data);
        lastFetchTimestamp.current = Date.now();
        hasFetchedOnce.current = true;

        if (settings.pagination) {
          const newResults = settings.pagination.getResults(apiResponse);
          const newMetadata = settings.pagination.getMetadata(apiResponse);
          const currentResponse = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : response;
          const mergedResults = settings.pagination.merge(currentResponse?.results, newResults, currentParams.page);
          setResponse({results: mergedResults, metadata: newMetadata});
        } else {
          setResponse(filteredData);
        }

        await settings.onSuccess(filteredData, finalParams);
      }

      setLoadingStates({isInitialLoading: false, isRefreshing: false, isLoadingMore: false});
      await settings.onCompleted();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, settings.uri, hasGlobalStore, response],
  );

  // (The rest of the useEffects and callbacks remain the same as the previous version)

  // --- Lifecycle Effects ---

  // Handle runOnMount
  useEffect(() => {
    const shouldFetch = settings.runOnMount && (!hasFetchedOnce.current || settings.alwaysRunOnMount);
    if (shouldFetch) {
      const existingData = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : null;
      if (existingData && !settings.alwaysRunOnMount) {
        return; // Data already exists, don't fetch
      }
      send('initial');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.runOnMount, settings.alwaysRunOnMount]);

  // Handle component unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (settings.abortOnUnmount) {
        apiRequest.current.abort();
      }
    };
  }, [settings.abortOnUnmount]);

  // Handle refreshDependencies
  useEffect(() => {
    if (hasFetchedOnce.current) {
      send('refresh');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, settings.refreshDependencies);

  // Handle runOnParamsChange (with debouncing)
  useEffect(() => {
    if (!settings.runOnParamsChange || !hasFetchedOnce.current) {
      return;
    }
    if (JSON.stringify(params) === JSON.stringify(previousParams.current)) {
      return;
    }
    previousParams.current = params;

    if (typeof settings.runOnParamsChange === 'number') {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        send('refresh');
      }, settings.runOnParamsChange);
    } else {
      send('refresh');
    }
  }, [params, settings.runOnParamsChange, send]);

  // --- Public API ---

  const refresh = useCallback(() => send('refresh'), [send]);
  const loadMore = useCallback(() => {
    const currentResponse = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : response;
    if (settings.pagination && currentResponse?.metadata?.hasMore) {
      send('pagination');
    }
  }, [send, settings.pagination, response, hasGlobalStore, settings.globalStore, settings.dataPath]);

  const updateParams = useCallback(updates => {
    setParams(prev => ({...prev, ...updates}));
  }, []);

  const handleOnChange = useCallback(
    key => newValue => {
      setParams(prev => ({...prev, [key]: newValue}));
    },
    [],
  );

  const focus = useCallback(() => {
    if (!settings.runOnFocus) return;
    if (settings.runOnFocus === 'once' && hasFetchedOnce.current) return;
    if (typeof settings.runOnFocus === 'number') {
      const staleTime = settings.runOnFocus * 1000;
      if (Date.now() - lastFetchTimestamp.current < staleTime) return;
    }
    refresh();
  }, [settings.runOnFocus, refresh]);

  const blur = useCallback(() => {
    if (settings.abortOnBlur) {
      apiRequest.current.abort();
    }
  }, [settings.abortOnBlur]);

  return {
    response,
    error,
    errorMessage,
    params,
    hasMore: (hasGlobalStore ? settings.globalStore.get(settings.dataPath)?.metadata?.hasMore : response?.metadata?.hasMore) ?? false,
    isLoading: loadingStates.isInitialLoading || loadingStates.isRefreshing || loadingStates.isLoadingMore,
    isInitialLoading: loadingStates.isInitialLoading,
    isRefreshing: loadingStates.isRefreshing,
    isLoadingMore: loadingStates.isLoadingMore,
    setResponse,
    setParams,
    updateParams,
    handleOnChange,
    send,
    refresh,
    loadMore,
    focus,
    blur,
  };
};

export { useApi as default };
