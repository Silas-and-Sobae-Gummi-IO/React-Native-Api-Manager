import { useMemo, useState, useRef, useCallback, useEffect, useContext } from 'react';
import { NavigationContext } from '@react-navigation/native';

/**
 * Custom error class for API-related errors with structured information.
 * 
 * @class ApiError
 * @extends {Error}
 */
class ApiError extends Error {
  /**
   * Creates an instance of ApiError.
   * 
   * @param {string} message - The error message
   * @param {number} status - The HTTP status code
   * @param {any} data - The parsed JSON error response from the server
   */
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Safely parses JSON response with fallback extraction for malformed JSON.
 * First attempts normal parsing, then tries to extract JSON from mixed content.
 * 
 * @param {string} responseBody - The raw text from the response
 * @returns {any} The parsed JSON data or null if empty
 * @throws {Error} Original parse error if all attempts fail
 */
const parseJsonSafely = (responseBody) => {
  if (!responseBody) return null;
  
  try {
    return JSON.parse(responseBody);
  } catch (parseError) {
    // Attempt to extract JSON from mixed content
    try {
      const openBraceIndex = responseBody.indexOf('{');
      const openBracketIndex = responseBody.indexOf('[');
      
      // Find the first occurrence of JSON start
      let startIndex = -1;
      if (openBraceIndex === -1) {
        startIndex = openBracketIndex;
      } else if (openBracketIndex === -1) {
        startIndex = openBraceIndex;
      } else {
        startIndex = Math.min(openBraceIndex, openBracketIndex);
      }
      
      if (startIndex === -1) throw parseError;
      
      // Find the last occurrence of JSON end
      const closeBraceIndex = responseBody.lastIndexOf('}');
      const closeBracketIndex = responseBody.lastIndexOf(']');
      const endIndex = Math.max(closeBraceIndex, closeBracketIndex);
      
      if (endIndex === -1) throw parseError;
      
      const extractedJson = responseBody.substring(startIndex, endIndex + 1);
      return JSON.parse(extractedJson);
    } catch {
      throw parseError;
    }
  }
};

/**
 * Parses a URI string that may contain a method prefix (e.g., 'post:users').
 * Supports standard HTTP methods and handles edge cases like URLs with colons.
 * 
 * @param {string} uri - The URI string, optionally prefixed with method
 * @param {string} [defaultMethod='GET'] - The default HTTP method to use
 * @returns {{method: string, endpoint: string}} Parsed method and endpoint
 */
const parseUriAndMethod = (uri, defaultMethod = 'GET') => {
  const VALID_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  
  if (!uri.includes(':')) {
    return { method: defaultMethod.toUpperCase(), endpoint: uri };
  }
  
  const [methodCandidate, ...endpointParts] = uri.split(':');
  const upperCaseMethod = methodCandidate.toUpperCase();
  
  if (VALID_HTTP_METHODS.includes(upperCaseMethod)) {
    return {
      method: upperCaseMethod,
      endpoint: endpointParts.join(':')
    };
  }
  
  return { method: defaultMethod.toUpperCase(), endpoint: uri };
};

/**
 * Creates a configured instance of the API Client with fetch-based HTTP functionality.
 * 
 * @param {Object} config - Configuration object for the API client
 * @param {string} config.baseUrl - Base URL for all requests
 * @param {Object} [config.headers] - Default headers to include with requests
 * @param {Function} [config.getDynamicHeaders] - Async function to get dynamic headers
 * @param {Object} [config.interceptors] - Request/response interceptors
 * @param {Function} [config.interceptors.onRequest] - Request interceptor
 * @param {Function} [config.interceptors.onResponse] - Response interceptor
 * @param {Function} [config.interceptors.onError] - Error interceptor
 * @param {Function} [config.interceptors.onFinally] - Finally interceptor
 * @param {boolean} [config.returnNullOnAbort=true] - Return null when request is aborted
 * @returns {Object} Configured API client instance
 */
const createApiClient = (config = {}) => {
  let abortController = new AbortController();
  const dynamicHeaders = new Map();

  /**
   * Builds the full URL by combining base URL and endpoint.
   * 
   * @param {string} baseUrl - The base URL
   * @param {string} endpoint - The endpoint path
   * @returns {string} The full URL with normalized slashes
   */
  const buildFullUrl = (baseUrl, endpoint) => {
    return `${baseUrl}/${endpoint}`.replace(/([^:]\/)\/+/g, '$1');
  };

  /**
   * Builds request headers from various sources.
   * 
   * @param {Object} config - API client configuration
   * @param {Object} requestOptions - Request-specific options
   * @param {Map} dynamicHeadersMap - Dynamic headers map
   * @returns {Promise<Headers>} The constructed Headers object
   */
  const buildRequestHeaders = async (config, requestOptions, dynamicHeadersMap) => {
    const headers = new Headers(config.headers || {});
    
    // Set default content type for non-FormData requests
    if (!(requestOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    
    // Add dynamic headers from configuration
    if (config.getDynamicHeaders) {
      const configDynamicHeaders = await config.getDynamicHeaders();
      Object.entries(configDynamicHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    
    // Add runtime dynamic headers
    dynamicHeadersMap.forEach((value, key) => {
      headers.set(key, value);
    });
    
    // Add request-specific headers
    if (requestOptions.headers) {
      Object.entries(requestOptions.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    
    // Remove content-type for FormData to let browser set it with boundary
    if (requestOptions.body instanceof FormData) {
      headers.delete('Content-Type');
    }
    
    return headers;
  };

  /**
   * Internal function to send HTTP requests with full interceptor support.
   * 
   * @param {string} uri - The URI to send the request to
   * @param {Object} requestOptions - Options for the request
   * @returns {Promise<any>} The response data
   */
  const sendRequest = async (uri, requestOptions = {}) => {
    const requestContext = { uri, options: requestOptions };

    try {
      const { method, endpoint } = parseUriAndMethod(uri, requestOptions.method);
      const fullUrl = buildFullUrl(config.baseUrl, endpoint);
      const requestHeaders = await buildRequestHeaders(config, requestOptions, dynamicHeaders);
      
      let fetchOptions = {
        ...requestOptions,
        method,
        headers: requestHeaders,
        signal: abortController.signal
      };

      // Run request interceptors
      if (config.interceptors?.onRequest) {
        const result = await config.interceptors.onRequest(fetchOptions, requestContext);
        if (result !== undefined) return result;
      }
      if (requestOptions.onRequest) {
        const result = await requestOptions.onRequest(fetchOptions, requestContext);
        if (result !== undefined) return result;
      }

      // Make the HTTP request
      const response = await fetch(fullUrl, fetchOptions);
      const responseBodyText = await response.text();
      
      // Parse response body
      let responseData;
      try {
        responseData = parseJsonSafely(responseBodyText);
      } catch (parseError) {
        throw new ApiError(
          'Invalid JSON response from server', 
          response.status, 
          responseBodyText
        );
      }

      // Check for HTTP errors
      if (!response.ok) {
        throw new ApiError(
          responseData?.message || `Request failed with status ${response.status}`, 
          response.status, 
          responseData
        );
      }

      // Run response interceptors
      let finalData = responseData;
      if (config.interceptors?.onResponse) {
        finalData = await config.interceptors.onResponse(finalData, response);
      }
      if (requestOptions.onResponse) {
        finalData = await requestOptions.onResponse(finalData, response);
      }

      return finalData;
      
    } catch (error) {
      // Handle abort errors
      if (error.name === 'AbortError') {
        if (config.returnNullOnAbort !== false) return null;
      }

      // Run error interceptors
      if (config.interceptors?.onError) {
        return config.interceptors.onError(error);
      }
      
      throw error;
    } finally {
      // Run finally interceptors
      if (config.interceptors?.onFinally) {
        await config.interceptors.onFinally();
      }
    }
  };

  // Public API client interface
  const apiClient = {
    /**
     * Aborts the current request and creates a new AbortController.
     */
    abort: () => {
      abortController.abort();
      abortController = new AbortController();
    },

    /**
     * Sets a dynamic header that will be included in all subsequent requests.
     * 
     * @param {string} key - Header name
     * @param {string} value - Header value
     */
    setHeader: (key, value) => dynamicHeaders.set(key, value),

    /**
     * Removes a dynamic header.
     * 
     * @param {string} key - Header name to remove
     */
    unsetHeader: (key) => dynamicHeaders.delete(key),

    /**
     * Clears all dynamic headers.
     */
    clearHeaders: () => dynamicHeaders.clear(),

    /**
     * Makes a generic HTTP request with the specified URI and options.
     * 
     * @param {string} uri - The URI to request, optionally prefixed with method
     * @param {Object} [options={}] - Request options
     * @param {Object} [options.params] - Query parameters to append to URL
     * @param {any} [options.body] - Request body data
     * @param {Object} [options.headers] - Request-specific headers
     * @returns {Promise<any>} The response data
     */
    request: (uri, options = {}) => {
      const { body, params, ...restOptions } = options;

      let requestUri = uri;
      
      // Add query parameters if provided
      if (params) {
        const queryString = new URLSearchParams(params).toString();
        const { endpoint } = parseUriAndMethod(uri, options.method);
        const uriParts = uri.split(':');
        const methodPrefix = uriParts.length > 1 ? `${uriParts[0]}:` : '';
        requestUri = `${methodPrefix}${endpoint}?${queryString}`;
      }

      // Prepare request body
      let requestBody;
      if (body) {
        requestBody = body instanceof FormData ? body : JSON.stringify(body);
      }

      return sendRequest(requestUri, {
        ...restOptions,
        body: requestBody,
      });
    },

    /**
     * Makes a GET request.
     * 
     * @param {string} uri - The URI to request
     * @param {Object} [params] - Query parameters
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    get: (uri, params, options) => 
      apiClient.request(uri, { params, ...options, method: 'GET' }),

    /**
     * Makes a POST request.
     * 
     * @param {string} uri - The URI to request
     * @param {any} [body] - Request body data
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    post: (uri, body, options) => 
      apiClient.request(uri, { body, ...options, method: 'POST' }),

    /**
     * Makes a PUT request.
     * 
     * @param {string} uri - The URI to request
     * @param {any} [body] - Request body data
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    put: (uri, body, options) => 
      apiClient.request(uri, { body, ...options, method: 'PUT' }),

    /**
     * Makes a DELETE request.
     * 
     * @param {string} uri - The URI to request
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    del: (uri, options) => 
      apiClient.request(uri, { ...options, method: 'DELETE' }),

    /**
     * Uploads files using FormData.
     * 
     * @param {string} uri - The URI to upload to
     * @param {Object} data - Key-value pairs to include in FormData
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    upload: (uri, data, options) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value);
      });
      return apiClient.request(uri, { body: formData, ...options, method: 'POST' });
    },

    /**
     * Executes multiple requests in parallel using Promise.all.
     * 
     * @param {Array<Object>} requests - Array of request configurations
     * @param {string} requests[].method - HTTP method (get, post, put, delete)
     * @param {string} requests[].uri - Request URI
     * @param {Object} [requests[].params] - Query parameters (for GET)
     * @param {any} [requests[].body] - Request body (for POST/PUT)
     * @returns {Promise<Array>} Array of response data in the same order as requests
     */
    all: (requests) => {
      const requestPromises = requests.map((requestConfig) => {
        const { method = 'get', uri, ...requestOptions } = requestConfig;
        const lowerMethod = method.toLowerCase();
        
        if (apiClient[lowerMethod]) {
          const payload = requestOptions.params || requestOptions.body;
          return apiClient[lowerMethod](uri, payload, requestOptions);
        }
        
        return Promise.reject(
          new Error(`Invalid HTTP method '${method}' in parallel request configuration`)
        );
      });
      
      return Promise.all(requestPromises);
    },
  };

  return apiClient;
};

/**
 * Creates and manages a singleton registry of ApiClient instances.
 * Provides centralized API client management with default client support and proxy methods.
 * 
 * @returns {Object} The manager instance with register, use, and proxy methods
 */
const createApiManager = () => {
  const registeredClients = new Map();
  let defaultClientName = null;

  const apiManager = {
    /**
     * Registers a new, named ApiClient instance.
     * 
     * @param {string} name - The unique name for this client
     * @param {Object} config - The configuration object for createApiClient
     * @param {boolean} [isDefault=false] - If true, sets this client as the default
     * @returns {Object} The newly created ApiClient instance
     * @throws {Error} If name is already registered or a default already exists
     */
    register: (name, config, isDefault = false) => {
      if (!name || typeof name !== 'string') {
        throw new Error('API client name must be a non-empty string');
      }
      
      if (registeredClients.has(name)) {
        throw new Error(`An API client named '${name}' is already registered`);
      }
      
      if (isDefault && defaultClientName) {
        throw new Error(
          `A default API client ('${defaultClientName}') is already registered. ` +
          `Cannot set '${name}' as a second default`
        );
      }

      const apiClient = createApiClient(config);
      registeredClients.set(name, apiClient);

      if (isDefault) {
        defaultClientName = name;
      }

      return apiClient;
    },

    /**
     * Retrieves a registered ApiClient instance by name.
     * 
     * @param {string} [name] - The name of the client to retrieve. If omitted, returns the default client
     * @returns {Object} The ApiClient instance
     * @throws {Error} If no name provided and no default set, or if named client doesn't exist
     */
    use: (name) => {
      const clientName = name || defaultClientName;

      if (!clientName) {
        throw new Error(
          'manager.use() was called without a name, but no default client has been registered'
        );
      }

      const apiClient = registeredClients.get(clientName);

      if (!apiClient) {
        throw new Error(`No API client named '${clientName}' has been registered`);
      }

      return apiClient;
    },

    /**
     * Checks if a client with the given name has been registered.
     * 
     * @param {string} name - The name of the client to check
     * @returns {boolean} True if the client is registered, false otherwise
     */
    isRegistered: (name) => {
      return registeredClients.has(name);
    },

    /**
     * Gets the name of the default client, if one is set.
     * 
     * @returns {string|null} The default client name or null if none set
     */
    getDefaultClientName: () => defaultClientName,

    /**
     * Gets a list of all registered client names.
     * 
     * @returns {string[]} Array of registered client names
     */
    getRegisteredClientNames: () => Array.from(registeredClients.keys()),
  };

  // Dynamically create proxy methods by inspecting a template client
  const templateClient = createApiClient({ baseUrl: '' });
  const clientMethods = ['request', 'get', 'post', 'put', 'del', 'upload', 'all', 'abort', 'setHeader', 'unsetHeader', 'clearHeaders'];

  clientMethods.forEach(methodName => {
    if (typeof templateClient[methodName] === 'function') {
      /**
       * Proxy method that forwards calls to the default client.
       * Throws an error if no default client is registered.
       */
      apiManager[methodName] = (...args) => {
        const defaultClient = apiManager.use(); // Throws if no default is set
        return defaultClient[methodName](...args);
      };
    }
  });

  return apiManager;
};

/**
 * The singleton instance of the ApiManager.
 * This is the main export that should be used throughout the application.
 */
const manager = createApiManager();

/**
 * A unified and flexible base hook for handling API requests.
 * @param {object} options - The configuration options for the hook.
 * @returns {object} The API state and methods.
 */
const useApiBase = (options = {}) => {
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

/**
 * A hook that safely subscribes to React Navigation's focus and blur events.
 * @param {{onFocus: Function, onBlur: Function}} callbacks - Callbacks for focus and blur.
 */
const useScreenFocus = ({onFocus, onBlur}) => {
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (!navigation) return;

    const focusUnsubscribe = navigation.addListener('focus', () => {
      if (onFocus) onFocus();
    });

    const blurUnsubscribe = navigation.addListener('blur', () => {
      if (onBlur) onBlur();
    });

    return () => {
      focusUnsubscribe();
      blurUnsubscribe();
    };
  }, [navigation, onFocus, onBlur]);
};

/**
 * A hook for making multiple API requests in parallel.
 * @param {object} apiClient - An instance of the ApiClient.
 * @param {Array<object>} requests - An array of request configurations.
 * @returns {{data: Array|null, loading: boolean, error: Error|null}}
 */
const useParallelApi = (apiClient, requests = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Stringify the requests to create a stable dependency for the effect hook.
    JSON.stringify(requests);

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const responses = await apiClient.all(requests);
        if (isMounted.current) {
          setData(responses);
        }
      } catch (err) {
        if (isMounted.current) {
          setError(err);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    if (requests.length > 0) {
      fetchData();
    } else {
      setLoading(false);
    }

    return () => {
      apiClient.abort();
    };
  }, [apiClient, requestKey]);

  return {data, loading, error};
};

/**
 * A project-specific wrapper for `useApiBase` that automatically integrates
 * with React Navigation's focus and blur events.
 * @param {object} options - Configuration options for useApiBase.
 * @returns {object} The API state and methods.
 */
const useApiNavigation = (options = {}) => {
  const api = useApiBase(options);

  useScreenFocus({
    onFocus: api.focus,
    onBlur: api.blur,
  });

  return api;
};

export { ApiError, manager as apiManager, createApiClient, useApiNavigation as useApi, useApiBase, useParallelApi, useScreenFocus };
