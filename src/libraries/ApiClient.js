/**
 * A custom error class to provide structured information about API errors.
 */
export class ApiError extends Error {
  /**
   * @param {string} message - The error message.
   * @param {number} status - The HTTP status code.
   * @param {any} data - The parsed JSON error response from the server.
   */
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Optimistically tries to parse JSON, falling back to a rescue attempt.
 * @param {string} responseBody - The raw text from the response.
 * @returns {any} The parsed JSON data.
 */
const safeJsonParse = responseBody => {
  if (!responseBody) return null;
  try {
    return JSON.parse(responseBody);
  } catch (parseError) {
    try {
      const firstBracket = responseBody.indexOf('{');
      const firstSquare = responseBody.indexOf('[');
      let startIndex = -1;

      if (firstBracket === -1) startIndex = firstSquare;
      else if (firstSquare === -1) startIndex = firstBracket;
      else startIndex = Math.min(firstBracket, firstSquare);

      if (startIndex === -1) throw parseError;

      const lastBracket = responseBody.lastIndexOf('}');
      const lastSquare = responseBody.lastIndexOf(']');
      const endIndex = Math.max(lastBracket, lastSquare);

      if (endIndex === -1) throw parseError;

      const jsonString = responseBody.substring(startIndex, endIndex + 1);
      return JSON.parse(jsonString);
    } catch {
      throw parseError;
    }
  }
};

/**
 * Parses a URI string that may contain a method prefix (e.g., 'post:users').
 * @param {string} uri - The URI string.
 * @param {string} [defaultMethod='GET'] - The default HTTP method.
 * @returns {{method: string, endpoint: string}}
 */
const _parseUriAndMethod = (uri, defaultMethod = 'GET') => {
  if (uri.includes(':')) {
    const [method, ...rest] = uri.split(':');
    const upperMethod = method.toUpperCase();
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
    if (validMethods.includes(upperMethod)) {
      return {method: upperMethod, endpoint: rest.join(':')};
    }
  }
  return {method: defaultMethod, endpoint: uri};
};

/**
 * Creates a configured instance of the API Client.
 * @param {object} config - The configuration for the API client.
 * @returns {object} An API client instance.
 */
export const createApiClient = (config = {}) => {
  let controller = new AbortController();
  const onTheFlyHeaders = new Map();

  const _send = async (uri, callOptions = {}) => {
    const callContext = {uri, options: callOptions};

    try {
      // 1. Prepare Request
      const {method, endpoint} = _parseUriAndMethod(uri, callOptions.method);
      const url = `${config.baseUrl}/${endpoint}`.replace(/([^:]\/)\/+/g, '$1');
      const headers = new Headers(config.headers || {});
      if (!(callOptions.body instanceof FormData)) headers.set('Content-Type', 'application/json');
      if (config.getDynamicHeaders) {
        const dynamicHeaders = await config.getDynamicHeaders();
        for (const key in dynamicHeaders) headers.set(key, dynamicHeaders[key]);
      }
      onTheFlyHeaders.forEach((value, key) => headers.set(key, value));
      for (const key in callOptions.headers) headers.set(key, callOptions.headers[key]);
      if (callOptions.body instanceof FormData) headers.delete('Content-Type');

      let requestOptions = {...callOptions, method, headers, signal: controller.signal};

      // 2. Interceptor Pipeline
      if (config.interceptors?.onRequest) {
        const result = await config.interceptors.onRequest(requestOptions, callContext);
        if (result !== undefined) return result;
      }
      if (callOptions.onRequest) {
        const result = await callOptions.onRequest(requestOptions, callContext);
        if (result !== undefined) return result;
      }

      // 3. Make the Request
      const response = await fetch(url, requestOptions);
      const responseBodyText = await response.text();
      let responseData;
      try {
        responseData = safeJsonParse(responseBodyText);
      } catch (e) {
        throw new ApiError('Invalid JSON response from server.', response.status, responseBodyText);
      }

      // 4. Handle HTTP Errors
      if (!response.ok) {
        throw new ApiError(responseData?.message || 'Request failed', response.status, responseData);
      }

      // 5. Success Interceptor Pipeline
      let finalData = responseData;
      if (config.interceptors?.onResponse) {
        finalData = await config.interceptors.onResponse(finalData, response);
      }
      if (callOptions.onResponse) {
        finalData = await callOptions.onResponse(finalData, response);
      }

      return finalData;
    } catch (error) {
      if (error.name === 'AbortError') {
        if (config.returnNullOnAbort !== false) return null;
      }

      if (config.interceptors?.onError) {
        return config.interceptors.onError(error);
      }
      throw error;
    } finally {
      if (config.interceptors?.onFinally) {
        await config.interceptors.onFinally();
      }
    }
  };

  const client = {
    abort: () => {
      controller.abort();
      controller = new AbortController();
    },
    setHeader: (key, value) => onTheFlyHeaders.set(key, value),
    unsetHeader: key => onTheFlyHeaders.delete(key),
    clearHeaders: () => onTheFlyHeaders.clear(),

    request: (uri, options = {}) => {
      const {body, params, ...restOptions} = options;
      const {endpoint} = _parseUriAndMethod(uri, options.method);

      let fullUri = uri;
      if (params) {
        const query = new URLSearchParams(params).toString();
        const uriParts = uri.split(':');
        const originalEndpoint = uriParts.length > 1 ? uriParts.slice(1).join(':') : uri;
        const methodPrefix = uriParts.length > 1 ? `${uriParts[0]}:` : '';
        fullUri = `${methodPrefix}${originalEndpoint}?${query}`;
      }

      const isFormData = body instanceof FormData;

      return _send(fullUri, {
        ...restOptions,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
      });
    },

    get: (uri, params, options) => client.request(uri, {params, ...options, method: 'GET'}),
    post: (uri, body, options) => client.request(uri, {body, ...options, method: 'POST'}),
    put: (uri, body, options) => client.request(uri, {body, ...options, method: 'PUT'}),
    del: (uri, options) => client.request(uri, {...options, method: 'DELETE'}),
    upload: (uri, data, options) => {
      const formData = new FormData();
      for (const key in data) {
        formData.append(key, data[key]);
      }
      return client.request(uri, {body: formData, ...options, method: 'POST'});
    },

    all: requests => {
      const promises = requests.map(reqConfig => {
        const {method = 'get', uri, ...options} = reqConfig;
        if (client[method.toLowerCase()]) {
          return client[method.toLowerCase()](uri, options.params || options.body, options);
        }
        return Promise.reject(new Error(`Invalid method '${method}' in parallel request.`));
      });
      return Promise.all(promises);
    },
  };

  return client;
};
