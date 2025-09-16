import {useState, useRef, useEffect, useCallback} from 'react';

/**
 * A unified and flexible base hook for handling API requests.
 * @param {object} options - The configuration options for the hook.
 * @param {object} options.apiManager - A required instance of your API client.
 * @returns {object} The API state and methods.
 */
export const useApiBase = (options = {}) => {
  if (!options.apiManager) {
    throw new Error('useApiBase requires an `apiManager` instance to be provided in the options.');
  }

  const settings = {
    uri: '',
    initialParams: {},
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
  };

  const [params, setParams] = useState(settings.initialParams);
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
  const response = hasGlobalStore ? settings.globalStore.use(settings.dataPath) : localResponseState[0];
  const setResponse = hasGlobalStore ? value => settings.globalStore.update(settings.dataPath, value) : localResponseState[1];

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
        const apiResponse = await apiClient.current.request(`post:${settings.uri}`, {body: finalParams});

        if (!isMounted.current || apiResponse === null) return;

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

  useEffect(() => {
    if (hasFetchedOnce.current) {
      send('refresh');
    }
  }, [send, settings.refreshDependencies]);

  useEffect(() => {
    if (!settings.runOnParamsChange || !hasFetchedOnce.current) return;
    if (JSON.stringify(params) === JSON.stringify(previousParams.current)) return;
    previousParams.current = params;

    if (typeof settings.runOnParamsChange === 'number') {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => send('refresh'), settings.runOnParamsChange);
    } else {
      send('refresh');
    }
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
