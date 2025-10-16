import {useState, useRef, useEffect, useCallback, useMemo} from 'react';

/**
 * A unified and flexible base hook for handling API requests.
 * @param {object} options - The configuration options for the hook.
 * @returns {object} The API state and methods.
 */
export const useApiBase = (options = {}) => {
  if (!options.apiManager) {
    throw new Error('useApiBase requires an `apiManager` instance to be provided in the options.');
  }

  // Memoize the settings object to prevent re-renders from causing dependency changes.
  const settings = useMemo(
    () => ({
      uri: '',
      initialParams: {},
      params: undefined, // Allow for controlled params
      globalStore: null,
      dataPath: '',
      runOnMount: false,
      alwaysRunOnMount: false,
      runOnFocus: false,
      runOnParamsChange: false,
      refreshDependencies: [],
      validateParams: () => true,
      abortOnUnmount: true,
      abortOnBlur: true,
      filterParams: params => params,
      filterResponse: data => data,
      onSubmit: () => {},
      onSuccess: () => {},
      onError: () => {},
      onCompleted: () => {},
      onRefresh: () => {},
      pagination: null,
      ...options,
    }),
    [options],
  );

  const [params, setParams] = useState(settings.initialParams || settings.params);
  const [error, setError] = useState(null);
  const [loadingStates, setLoadingStates] = useState({
    isInitialLoading: settings.runOnMount,
    isRefreshing: false,
    isLoadingMore: false,
  });

  const apiClient = useRef(settings.apiManager);
  const lastFetchTimestamp = useRef(0);
  const hasFetchedOnce = useRef(false);
  const isMounted = useRef(true);
  const debounceTimer = useRef(null);
  const previousParams = useRef(params);

  const localResponseState = useState(settings.pagination ? {results: []} : null);
  const hasGlobalStore = !!(settings.globalStore && settings.dataPath);

  const response = useMemo(
    () => (hasGlobalStore ? settings.globalStore.use(settings.dataPath) : localResponseState[0]),
    [hasGlobalStore, settings.globalStore, settings.dataPath, localResponseState],
  );

  const setResponse = useCallback(
    value => (hasGlobalStore ? settings.globalStore.update(settings.dataPath, value) : localResponseState[1](value)),
    [hasGlobalStore, settings.globalStore, settings.dataPath, localResponseState],
  );

  // Effect to sync internal params state if `params` prop is provided (controlled hook).
  const paramsPropString = useMemo(() => JSON.stringify(settings.params), [settings.params]);
  useEffect(() => {
    if (settings.params) {
      setParams(settings.params);
    }
  }, [paramsPropString, settings.params]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasGlobalStore) {
      const existingData = settings.globalStore.get(settings.dataPath);
      if (existingData) {
        setLoadingStates(prev => ({...prev, isInitialLoading: false}));
      }
    }
  }, [hasGlobalStore, settings.globalStore, settings.dataPath]);

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

      const currentParams = {...params, ...oneTimeParams};
      if (mode === 'pagination' && settings.pagination) {
        const currentResponse = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : response;
        const page = currentResponse?.metadata?.page || 0;
        currentParams.page = page + 1;
      }
      const finalParams = settings.filterParams(currentParams);

      if (!settings.validateParams(finalParams)) {
        setLoadingStates({isInitialLoading: false, isRefreshing: false, isLoadingMore: false});
        return;
      }

      await settings.onSubmit();
      if (mode === 'refresh') await settings.onRefresh();

      try {
        // NOTE: Defaulting to `post` for data submission. Change if your API uses GET for queries with bodies.
        const apiResponse = await apiClient.current.request(`post:${settings.uri}`, {body: finalParams});

        if (!isMounted.current || apiResponse === null) return; // Aborted or unmounted

        const filteredData = settings.filterResponse(apiResponse);
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
      } catch (err) {
        if (isMounted.current) setError(err);
        await settings.onError(err);
      } finally {
        if (isMounted.current) {
          setLoadingStates({isInitialLoading: false, isRefreshing: false, isLoadingMore: false});
          await settings.onCompleted();
        }
      }
    },
    [params, settings, hasGlobalStore, response, loadingStates, setResponse],
  );

  useEffect(() => {
    if (settings.abortOnUnmount) {
      const client = apiClient.current;
      return () => client.abort();
    }
  }, [settings.abortOnUnmount]);

  useEffect(() => {
    const shouldFetch = settings.runOnMount && (!hasFetchedOnce.current || settings.alwaysRunOnMount);
    if (shouldFetch) {
      const existingData = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : null;
      if (!existingData || settings.alwaysRunOnMount) {
        send('initial');
      }
    }
  }, [settings.runOnMount, settings.alwaysRunOnMount, send, hasGlobalStore, settings.globalStore, settings.dataPath]);

  const refreshDependencyKey = useMemo(() => JSON.stringify(settings.refreshDependencies), [settings.refreshDependencies]);
  useEffect(() => {
    if (hasFetchedOnce.current && settings.refreshDependencies.length > 0) {
      send('refresh');
    }
  }, [send, refreshDependencyKey]);

  useEffect(() => {
    if (!settings.runOnParamsChange || !hasFetchedOnce.current) return;
    if (JSON.stringify(params) === JSON.stringify(previousParams.current)) return;
    previousParams.current = params;

    const debounceMs = typeof settings.runOnParamsChange === 'number' ? settings.runOnParamsChange : 300;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => send('refresh'), debounceMs);
  }, [params, settings.runOnParamsChange, send]);

  const refresh = useCallback(() => send('refresh'), [send]);

  const loadMore = useCallback(() => {
    const currentResponse = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : response;
    if (settings.pagination && currentResponse?.metadata?.hasMore) {
      send('pagination');
    }
  }, [send, settings.pagination, response, hasGlobalStore, settings.globalStore, settings.dataPath]);

  const updateParams = useCallback(updates => setParams(prev => ({...prev, ...updates})), []);
  const handleOnChange = useCallback(key => value => setParams(prev => ({...prev, [key]: value})), []);

  const focus = useCallback(() => {
    if (!settings.runOnFocus) return;
    if (settings.runOnFocus === 'once' && hasFetchedOnce.current) return;
    if (typeof settings.runOnFocus === 'number') {
      if (Date.now() - lastFetchTimestamp.current < settings.runOnFocus * 1000) return;
    }
    refresh();
  }, [settings.runOnFocus, refresh]);

  const blur = useCallback(() => {
    if (settings.abortOnBlur) {
      apiClient.current.abort();
    }
  }, [settings.abortOnBlur]);

  return {
    response,
    error,
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
