// src/client/ApiClient.js

import { InterceptorManager } from './internals/InterceptorManager';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';
import { ApiError } from '../core/ApiError';
import { parseShorthandUrl, parseInterceptorShorthand } from '../utils/parser';
import { mergeHeaders } from '../utils/headers';

// --- Logger Definition ---
const loggerInterceptor = {
  onRequest: (config) => {
    console.log(
      `[API Request] ${config.method.toUpperCase()} -> ${config.url}`
    );
    return config;
  },
  onSuccess: (data) => {
    console.log('[API Success]', data);
    return data;
  },
  onError: (error) => {
    console.log('[API Error]', error);
    // IMPORTANT: Re-throw the error to not break the chain
    throw error;
  },
};

export class ApiClient {
  /**
   * @param {object} config
   * @param {string} [config.baseURL]
   * @param {object} [config.headers]
   * @param {number} [config.timeout]
   * @param {'none'|'debug'} [config.logLevel]
   */
  constructor(config = {}) {
    this.config = config;
    this.interceptors = new InterceptorManager();
    this.cancellableRequests = new Map();

    if (this.config.logLevel === 'debug') {
      this.interceptors.add('internal-logger', loggerInterceptor, 999);
    }
  }

  /**
   * Main request method, responsible for the retry loop.
   * @private
   */
  async _request(requestSpecificConfig) {
    // Merge instance and per-request config, carefully merging headers
    const mergedHeaders = mergeHeaders(
      this.config.headers || {},
      requestSpecificConfig.headers || {}
    );

    const config = {
      ...this.config,
      ...requestSpecificConfig,
      headers: mergedHeaders,
    };

    const maxRetries = config.retries ?? 0;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._executeAttempt(config);
      } catch (error) {
        lastError = error;

        // Don't retry on our own timeout errors
        if (error instanceof ApiError && error.message.includes('timed out')) {
          break;
        }

        const isLastAttempt = attempt === maxRetries;
        if (isLastAttempt) break;

        const retryOn = config.retryOn ?? [];
        const isNetworkError =
          !error.response && retryOn.includes('network-error');
        const isRetryableStatus =
          error.status && retryOn.includes(error.status);

        if (isNetworkError || isRetryableStatus) {
          const delay = config.retryDelay ? config.retryDelay(attempt + 1) : 0;
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } else {
          break;
        }
      }
    }
    const finalError = await this.interceptors.run('onError', lastError);
    throw finalError;
  }

  /**
   * Orchestrates a single request attempt: setup, execution, cleanup.
   * @private
   */
  async _executeAttempt(config) {
    const { controller, timeoutId } = this._setupAttempt(config);
    try {
      return await this._performFetch(config, controller);
    } finally {
      this._cleanupAttempt(config, timeoutId);
    }
  }

  /**
   * Handles pre-flight logic: AbortController, cancelKey, and timeout.
   * @private
   */
  _setupAttempt(config) {
    const controller = new AbortController();
    let timeoutId = null;

    if (config.cancelKey) {
      this.cancellableRequests.get(config.cancelKey)?.abort();
      this.cancellableRequests.set(config.cancelKey, controller);
    }

    if (config.timeout) {
      timeoutId = setTimeout(() => {
        controller.abort('timeout'); // Pass a reason for the abort
      }, config.timeout);
    }

    return { controller, timeoutId };
  }

  /**
   * The core fetch pipeline for a single attempt.
   * @private
   */
  async _performFetch(config, controller) {
    const attemptConfig = { ...config, signal: controller.signal };
    try {
      const finalConfig = await this.interceptors.run(
        'onRequest',
        attemptConfig
      );
      const { url: finalUrl, ...fetchOptions } =
        buildRequestConfig(finalConfig);
      const response = await fetch(finalUrl, fetchOptions);
      const data = await parseResponse(response, finalConfig);

      let transformedData = data;
      if (typeof finalConfig.transformResponse === 'function') {
        transformedData = finalConfig.transformResponse(data);
      }
      return await this.interceptors.run('onSuccess', transformedData);
    } catch (error) {
      // Check if the abort was caused by our timeout
      if (
        error.name === 'AbortError' &&
        controller.signal.reason === 'timeout'
      ) {
        throw new ApiError(
          `Request timed out after ${config.timeout}ms`,
          config
        );
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Handles post-flight cleanup: clearing timeouts and cancelKeys.
   * @private
   */
  _cleanupAttempt(config, timeoutId) {
    if (timeoutId) clearTimeout(timeoutId);
    if (config.cancelKey) {
      this.cancellableRequests.delete(config.cancelKey);
    }
  }

  // --- Public Methods ---
  get = async (url, options = {}) =>
    this._request({ method: 'GET', url, ...options });
  post = async (url, body, options = {}) =>
    this._request({ method: 'POST', url, body, ...options });
  put = async (url, body, options = {}) =>
    this._request({ method: 'PUT', url, body, ...options });
  patch = async (url, body, options = {}) =>
    this._request({ method: 'PATCH', url, body, ...options });
  delete = async (url, options = {}) =>
    this._request({ method: 'DELETE', url, ...options });

  request = async (shorthandUrl, ...args) => {
    const { method, url } = parseShorthandUrl(shorthandUrl);
    const methodsWithBody = ['post', 'put', 'patch'];

    if (methodsWithBody.includes(method)) {
      const body = args[0];
      const options = args[1] || {};
      return this[method](url, body, options);
    } else {
      const options = args[0] || {};
      return this[method](url, options);
    }
  };

  configureInterceptor = (shorthand, callbacks) => {
    const command = parseInterceptorShorthand(shorthand);
    if (!command) {
      throw new Error(`Invalid interceptor shorthand: ${shorthand}`);
    }

    switch (command.action) {
      case 'add':
        this.interceptors.add(command.name, callbacks, command.priority);
        break;
      case 'remove':
        this.interceptors.remove(command.name);
        break;
      default:
        throw new Error(`Unsupported interceptor action: ${command.action}`);
    }
  };
}
