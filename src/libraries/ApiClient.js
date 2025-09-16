/**
 * Custom error class for API-related errors with structured information.
 * 
 * @class ApiError
 * @extends {Error}
 */
export class ApiError extends Error {
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
export const createApiClient = (config = {}) => {
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
