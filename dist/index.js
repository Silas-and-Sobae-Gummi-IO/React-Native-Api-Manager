var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var index_exports = {};
__export(index_exports, {
  ApiError: () => ApiError,
  apiManager: () => manager,
  createApiClient: () => createApiClient,
  useApi: () => useApiNavigation,
  useApiBase: () => useApiBase,
  useParallelApi: () => useParallelApi,
  useScreenFocus: () => useScreenFocus
});
module.exports = __toCommonJS(index_exports);

// src/libraries/ApiClient.js
var ApiError = class extends Error {
  /**
   * Creates an instance of ApiError.
   * 
   * @param {string} message - The error message
   * @param {number} status - The HTTP status code
   * @param {any} data - The parsed JSON error response from the server
   */
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
};
var parseJsonSafely = (responseBody) => {
  if (!responseBody) return null;
  try {
    return JSON.parse(responseBody);
  } catch (parseError) {
    try {
      const openBraceIndex = responseBody.indexOf("{");
      const openBracketIndex = responseBody.indexOf("[");
      let startIndex = -1;
      if (openBraceIndex === -1) {
        startIndex = openBracketIndex;
      } else if (openBracketIndex === -1) {
        startIndex = openBraceIndex;
      } else {
        startIndex = Math.min(openBraceIndex, openBracketIndex);
      }
      if (startIndex === -1) throw parseError;
      const closeBraceIndex = responseBody.lastIndexOf("}");
      const closeBracketIndex = responseBody.lastIndexOf("]");
      const endIndex = Math.max(closeBraceIndex, closeBracketIndex);
      if (endIndex === -1) throw parseError;
      const extractedJson = responseBody.substring(startIndex, endIndex + 1);
      return JSON.parse(extractedJson);
    } catch {
      throw parseError;
    }
  }
};
var parseUriAndMethod = (uri, defaultMethod = "GET") => {
  const VALID_HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
  if (!uri.includes(":")) {
    return { method: defaultMethod.toUpperCase(), endpoint: uri };
  }
  const [methodCandidate, ...endpointParts] = uri.split(":");
  const upperCaseMethod = methodCandidate.toUpperCase();
  if (VALID_HTTP_METHODS.includes(upperCaseMethod)) {
    return {
      method: upperCaseMethod,
      endpoint: endpointParts.join(":")
    };
  }
  return { method: defaultMethod.toUpperCase(), endpoint: uri };
};
var createApiClient = (config = {}) => {
  let abortController = new AbortController();
  const dynamicHeaders = /* @__PURE__ */ new Map();
  const buildFullUrl = (baseUrl, endpoint) => {
    return `${baseUrl}/${endpoint}`.replace(/([^:]\/)\/+/g, "$1");
  };
  const buildRequestHeaders = async (config2, requestOptions, dynamicHeadersMap) => {
    const headers = new Headers(config2.headers || {});
    if (!(requestOptions.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (config2.getDynamicHeaders) {
      const configDynamicHeaders = await config2.getDynamicHeaders();
      Object.entries(configDynamicHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    dynamicHeadersMap.forEach((value, key) => {
      headers.set(key, value);
    });
    if (requestOptions.headers) {
      Object.entries(requestOptions.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    if (requestOptions.body instanceof FormData) {
      headers.delete("Content-Type");
    }
    return headers;
  };
  const sendRequest = async (uri, requestOptions = {}) => {
    var _a, _b, _c, _d;
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
      if ((_a = config.interceptors) == null ? void 0 : _a.onRequest) {
        const result = await config.interceptors.onRequest(fetchOptions, requestContext);
        if (result !== void 0) return result;
      }
      if (requestOptions.onRequest) {
        const result = await requestOptions.onRequest(fetchOptions, requestContext);
        if (result !== void 0) return result;
      }
      const response = await fetch(fullUrl, fetchOptions);
      const responseBodyText = await response.text();
      let responseData;
      try {
        responseData = parseJsonSafely(responseBodyText);
      } catch (parseError) {
        throw new ApiError(
          "Invalid JSON response from server",
          response.status,
          responseBodyText
        );
      }
      if (!response.ok) {
        throw new ApiError(
          (responseData == null ? void 0 : responseData.message) || `Request failed with status ${response.status}`,
          response.status,
          responseData
        );
      }
      let finalData = responseData;
      if ((_b = config.interceptors) == null ? void 0 : _b.onResponse) {
        finalData = await config.interceptors.onResponse(finalData, response);
      }
      if (requestOptions.onResponse) {
        finalData = await requestOptions.onResponse(finalData, response);
      }
      return finalData;
    } catch (error) {
      if (error.name === "AbortError") {
        if (config.returnNullOnAbort !== false) return null;
      }
      if ((_c = config.interceptors) == null ? void 0 : _c.onError) {
        return config.interceptors.onError(error);
      }
      throw error;
    } finally {
      if ((_d = config.interceptors) == null ? void 0 : _d.onFinally) {
        await config.interceptors.onFinally();
      }
    }
  };
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
      if (params) {
        const queryString = new URLSearchParams(params).toString();
        const { endpoint } = parseUriAndMethod(uri, options.method);
        const uriParts = uri.split(":");
        const methodPrefix = uriParts.length > 1 ? `${uriParts[0]}:` : "";
        requestUri = `${methodPrefix}${endpoint}?${queryString}`;
      }
      let requestBody;
      if (body) {
        requestBody = body instanceof FormData ? body : JSON.stringify(body);
      }
      return sendRequest(requestUri, {
        ...restOptions,
        body: requestBody
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
    get: (uri, params, options) => apiClient.request(uri, { params, ...options, method: "GET" }),
    /**
     * Makes a POST request.
     * 
     * @param {string} uri - The URI to request
     * @param {any} [body] - Request body data
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    post: (uri, body, options) => apiClient.request(uri, { body, ...options, method: "POST" }),
    /**
     * Makes a PUT request.
     * 
     * @param {string} uri - The URI to request
     * @param {any} [body] - Request body data
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    put: (uri, body, options) => apiClient.request(uri, { body, ...options, method: "PUT" }),
    /**
     * Makes a DELETE request.
     * 
     * @param {string} uri - The URI to request
     * @param {Object} [options] - Additional request options
     * @returns {Promise<any>} The response data
     */
    del: (uri, options) => apiClient.request(uri, { ...options, method: "DELETE" }),
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
      return apiClient.request(uri, { body: formData, ...options, method: "POST" });
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
        const { method = "get", uri, ...requestOptions } = requestConfig;
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
    }
  };
  return apiClient;
};

// src/services/ApiManager.js
var createApiManager = () => {
  const registeredClients = /* @__PURE__ */ new Map();
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
      if (!name || typeof name !== "string") {
        throw new Error("API client name must be a non-empty string");
      }
      if (registeredClients.has(name)) {
        throw new Error(`An API client named '${name}' is already registered`);
      }
      if (isDefault && defaultClientName) {
        throw new Error(
          `A default API client ('${defaultClientName}') is already registered. Cannot set '${name}' as a second default`
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
          "manager.use() was called without a name, but no default client has been registered"
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
    getRegisteredClientNames: () => Array.from(registeredClients.keys())
  };
  const templateClient = createApiClient({ baseUrl: "" });
  const clientMethods = ["request", "get", "post", "put", "del", "upload", "all", "abort", "setHeader", "unsetHeader", "clearHeaders"];
  clientMethods.forEach((methodName) => {
    if (typeof templateClient[methodName] === "function") {
      apiManager[methodName] = (...args) => {
        const defaultClient = apiManager.use();
        return defaultClient[methodName](...args);
      };
    }
  });
  return apiManager;
};
var manager = createApiManager();

// src/hooks/useApiBase.js
var import_react = require("react");
var useApiBase = (options = {}) => {
  var _a, _b, _c;
  if (!options.apiManager) {
    throw new Error("useApiBase requires an `apiManager` instance to be provided in the options.");
  }
  const settings = (0, import_react.useMemo)(
    () => ({
      uri: "",
      initialParams: {},
      params: void 0,
      // Allow for controlled params
      globalStore: null,
      dataPath: "",
      runOnMount: false,
      alwaysRunOnMount: false,
      runOnFocus: false,
      runOnParamsChange: false,
      refreshDependencies: [],
      validateParams: () => true,
      abortOnUnmount: true,
      abortOnBlur: true,
      filterParams: (params2) => params2,
      filterResponse: (data) => data,
      onSubmit: () => {
      },
      onSuccess: () => {
      },
      onError: () => {
      },
      onCompleted: () => {
      },
      onRefresh: () => {
      },
      pagination: null,
      ...options
    }),
    [options]
  );
  const [params, setParams] = (0, import_react.useState)(settings.initialParams || settings.params);
  const [error, setError] = (0, import_react.useState)(null);
  const [loadingStates, setLoadingStates] = (0, import_react.useState)({
    isInitialLoading: settings.runOnMount,
    isRefreshing: false,
    isLoadingMore: false
  });
  const apiClient = (0, import_react.useRef)(settings.apiManager);
  const lastFetchTimestamp = (0, import_react.useRef)(0);
  const hasFetchedOnce = (0, import_react.useRef)(false);
  const isMounted = (0, import_react.useRef)(true);
  const debounceTimer = (0, import_react.useRef)(null);
  const previousParams = (0, import_react.useRef)(params);
  const localResponseState = (0, import_react.useState)(settings.pagination ? { results: [] } : null);
  const hasGlobalStore = !!(settings.globalStore && settings.dataPath);
  const response = (0, import_react.useMemo)(
    () => hasGlobalStore ? settings.globalStore.use(settings.dataPath) : localResponseState[0],
    [hasGlobalStore, settings.globalStore, settings.dataPath, localResponseState]
  );
  const setResponse = (0, import_react.useCallback)(
    (value) => hasGlobalStore ? settings.globalStore.update(settings.dataPath, value) : localResponseState[1](value),
    [hasGlobalStore, settings.globalStore, settings.dataPath, localResponseState]
  );
  const paramsPropString = (0, import_react.useMemo)(() => JSON.stringify(settings.params), [settings.params]);
  (0, import_react.useEffect)(() => {
    if (settings.params) {
      setParams(settings.params);
    }
  }, [paramsPropString, settings.params]);
  (0, import_react.useEffect)(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  (0, import_react.useEffect)(() => {
    if (hasGlobalStore) {
      const existingData = settings.globalStore.get(settings.dataPath);
      if (existingData) {
        setLoadingStates((prev) => ({ ...prev, isInitialLoading: false }));
      }
    }
  }, [hasGlobalStore, settings.globalStore, settings.dataPath]);
  const send = (0, import_react.useCallback)(
    async (mode = "initial", oneTimeParams = {}) => {
      var _a2;
      if (loadingStates.isInitialLoading || loadingStates.isRefreshing) {
        if (mode !== "pagination" || !settings.pagination) return;
      }
      setLoadingStates((prev) => ({
        ...prev,
        isInitialLoading: mode === "initial" && !hasFetchedOnce.current,
        isRefreshing: mode === "refresh",
        isLoadingMore: mode === "pagination"
      }));
      setError(null);
      const currentParams = { ...params, ...oneTimeParams };
      if (mode === "pagination" && settings.pagination) {
        const currentResponse = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : response;
        const page = ((_a2 = currentResponse == null ? void 0 : currentResponse.metadata) == null ? void 0 : _a2.page) || 0;
        currentParams.page = page + 1;
      }
      const finalParams = settings.filterParams(currentParams);
      if (!settings.validateParams(finalParams)) {
        setLoadingStates({ isInitialLoading: false, isRefreshing: false, isLoadingMore: false });
        return;
      }
      await settings.onSubmit();
      if (mode === "refresh") await settings.onRefresh();
      try {
        const apiResponse = await apiClient.current.request(`post:${settings.uri}`, { body: finalParams });
        if (!isMounted.current || apiResponse === null) return;
        const filteredData = settings.filterResponse(apiResponse);
        lastFetchTimestamp.current = Date.now();
        hasFetchedOnce.current = true;
        if (settings.pagination) {
          const newResults = settings.pagination.getResults(apiResponse);
          const newMetadata = settings.pagination.getMetadata(apiResponse);
          const currentResponse = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : response;
          const mergedResults = settings.pagination.merge(currentResponse == null ? void 0 : currentResponse.results, newResults, currentParams.page);
          setResponse({ results: mergedResults, metadata: newMetadata });
        } else {
          setResponse(filteredData);
        }
        await settings.onSuccess(filteredData, finalParams);
      } catch (err) {
        if (isMounted.current) setError(err);
        await settings.onError(err);
      } finally {
        if (isMounted.current) {
          setLoadingStates({ isInitialLoading: false, isRefreshing: false, isLoadingMore: false });
          await settings.onCompleted();
        }
      }
    },
    [params, settings, hasGlobalStore, response, loadingStates, setResponse]
  );
  (0, import_react.useEffect)(() => {
    if (settings.abortOnUnmount) {
      const client = apiClient.current;
      return () => client.abort();
    }
  }, [settings.abortOnUnmount]);
  (0, import_react.useEffect)(() => {
    const shouldFetch = settings.runOnMount && (!hasFetchedOnce.current || settings.alwaysRunOnMount);
    if (shouldFetch) {
      const existingData = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : null;
      if (!existingData || settings.alwaysRunOnMount) {
        send("initial");
      }
    }
  }, [settings.runOnMount, settings.alwaysRunOnMount, send, hasGlobalStore, settings.globalStore, settings.dataPath]);
  const refreshDependencyKey = (0, import_react.useMemo)(() => JSON.stringify(settings.refreshDependencies), [settings.refreshDependencies]);
  (0, import_react.useEffect)(() => {
    if (hasFetchedOnce.current && settings.refreshDependencies.length > 0) {
      send("refresh");
    }
  }, [send, refreshDependencyKey]);
  (0, import_react.useEffect)(() => {
    if (!settings.runOnParamsChange || !hasFetchedOnce.current) return;
    if (JSON.stringify(params) === JSON.stringify(previousParams.current)) return;
    previousParams.current = params;
    const debounceMs = typeof settings.runOnParamsChange === "number" ? settings.runOnParamsChange : 300;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => send("refresh"), debounceMs);
  }, [params, settings.runOnParamsChange, send]);
  const refresh = (0, import_react.useCallback)(() => send("refresh"), [send]);
  const loadMore = (0, import_react.useCallback)(() => {
    var _a2;
    const currentResponse = hasGlobalStore ? settings.globalStore.get(settings.dataPath) : response;
    if (settings.pagination && ((_a2 = currentResponse == null ? void 0 : currentResponse.metadata) == null ? void 0 : _a2.hasMore)) {
      send("pagination");
    }
  }, [send, settings.pagination, response, hasGlobalStore, settings.globalStore, settings.dataPath]);
  const updateParams = (0, import_react.useCallback)((updates) => setParams((prev) => ({ ...prev, ...updates })), []);
  const handleOnChange = (0, import_react.useCallback)((key) => (value) => setParams((prev) => ({ ...prev, [key]: value })), []);
  const focus = (0, import_react.useCallback)(() => {
    if (!settings.runOnFocus) return;
    if (settings.runOnFocus === "once" && hasFetchedOnce.current) return;
    if (typeof settings.runOnFocus === "number") {
      if (Date.now() - lastFetchTimestamp.current < settings.runOnFocus * 1e3) return;
    }
    refresh();
  }, [settings.runOnFocus, refresh]);
  const blur = (0, import_react.useCallback)(() => {
    if (settings.abortOnBlur) {
      apiClient.current.abort();
    }
  }, [settings.abortOnBlur]);
  return {
    response,
    error,
    params,
    hasMore: (hasGlobalStore ? (_b = (_a = settings.globalStore.get(settings.dataPath)) == null ? void 0 : _a.metadata) == null ? void 0 : _b.hasMore : (_c = response == null ? void 0 : response.metadata) == null ? void 0 : _c.hasMore) ?? false,
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
    blur
  };
};

// src/hooks/useScreenFocus.js
var import_react2 = require("react");
var import_native = require("@react-navigation/native");
var useScreenFocus = ({ onFocus, onBlur }) => {
  const navigation = (0, import_react2.useContext)(import_native.NavigationContext);
  (0, import_react2.useEffect)(() => {
    if (!navigation) return;
    const focusUnsubscribe = navigation.addListener("focus", () => {
      if (onFocus) onFocus();
    });
    const blurUnsubscribe = navigation.addListener("blur", () => {
      if (onBlur) onBlur();
    });
    return () => {
      focusUnsubscribe();
      blurUnsubscribe();
    };
  }, [navigation, onFocus, onBlur]);
};

// src/hooks/useParallelApi.js
var import_react3 = require("react");
var useParallelApi = (apiClient, requests = []) => {
  const [data, setData] = (0, import_react3.useState)(null);
  const [loading, setLoading] = (0, import_react3.useState)(true);
  const [error, setError] = (0, import_react3.useState)(null);
  const isMounted = (0, import_react3.useRef)(true);
  (0, import_react3.useEffect)(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  (0, import_react3.useEffect)(() => {
    const requestKey2 = JSON.stringify(requests);
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
  return { data, loading, error };
};

// src/hooks/useApiNavigation.js
var useApiNavigation = (options = {}) => {
  const api = useApiBase(options);
  useScreenFocus({
    onFocus: api.focus,
    onBlur: api.blur
  });
  return api;
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ApiError,
  apiManager,
  createApiClient,
  useApi,
  useApiBase,
  useParallelApi,
  useScreenFocus
});
//# sourceMappingURL=index.js.map