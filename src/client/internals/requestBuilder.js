// src/client/internals/requestBuilder.js

import {serializeParams} from '../../utils/url';
import {mergeHeaders} from '../../utils/headers';

// isReactNativeFile and containsFile functions remain the same
function isReactNativeFile(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.uri === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string'
  );
}

function containsFile(data) {
  if (isReactNativeFile(data)) {
    return true;
  }
  if (Array.isArray(data)) {
    return data.some((item) => containsFile(item));
  }
  if (typeof data === 'object' && data !== null) {
    return Object.values(data).some((value) => containsFile(value));
  }
  return false;
}

/**
 * Builds the final request URL and options object for fetch.
 * @param {object} config The user-friendly request configuration.
 * @returns {{url: string, options: object}} The final URL and fetch options.
 */
export function buildRequestConfig(config) {
  // Join baseURL and url when baseURL is provided; otherwise use url as-is
  const combinedUrl = config.baseURL ? `${String(config.baseURL).replace(/\/$/, '')}/${String(config.url).replace(/^\//, '')}` : String(config.url);

  const queryString = serializeParams(config.params);
  const urlWithParams = `${combinedUrl}${queryString}`;

  // Headers: accept a single merged headers object from the caller
  const finalHeaders = mergeHeaders(config.headers || {});

  const fetchOptions = {
    method: String(config.method).toUpperCase(),
    headers: finalHeaders,
    signal: config.signal,
  };

  if (config.body !== undefined) {
    // FIX #2: Reorder logic to handle FormData correctly
    if (containsFile(config.body)) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(config.body)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            formData.append(key, item);
          }
        } else {
          formData.append(key, value);
        }
      }
      fetchOptions.body = formData;
    } else if (config.body instanceof FormData) {
      // This is the new, crucial check.
      // If it's already FormData, pass it through.
      fetchOptions.body = config.body;
    } else if (typeof config.body === 'object' && config.body !== null) {
      fetchOptions.body = JSON.stringify(config.body);
      if (!fetchOptions.headers['content-type']) {
        fetchOptions.headers['content-type'] = 'application/json';
      }
    } else {
      fetchOptions.body = config.body;
    }
  }

  return {
    url: urlWithParams,
    options: fetchOptions,
  };
}
