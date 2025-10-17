// src/client/ApiClient.js

import { InterceptorManager } from './internals/InterceptorManager';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';
import { ApiError } from '../core/ApiError';

/**
 * The main client for making API requests.
 */
export class ApiClient {
  /**
   * Creates an instance of ApiClient.
   * @param {object} config The base configuration for this client instance.
   */
  constructor(config = {}) {
    this.config = config;
    this.interceptors = new InterceptorManager();
    // A map to store active cancellable requests.
    this.cancellableRequests = new Map();
  }

  /**
   * The core internal request method that orchestrates the entire lifecycle.
   * @param {object} requestSpecificConfig The configuration for this specific request.
   * @returns {Promise<any>} A promise that resolves with the final data.
   * @private
   */
  async _request(requestSpecificConfig) {
    // 1. Initial configuration setup
    const config = { ...this.config, ...requestSpecificConfig };
    const maxRetries = config.retries ?? 0;

    let lastError = null;

    // 2. The Retry Loop
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Create a new controller for each attempt to allow retrying after aborts
      const controller = new AbortController();
      let attemptConfig = { ...config, signal: controller.signal };

      let timeoutId = null;
      let timedOut = false;

      if (attemptConfig.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, attemptConfig.timeout);
      }

      try {
        // --- This is the main request execution block ---
        attemptConfig = await this.interceptors.run('onRequest', attemptConfig);
        const { url: finalUrl, ...fetchOptions } =
          buildRequestConfig(attemptConfig);
        const response = await fetch(finalUrl, fetchOptions);
        const data = await parseResponse(response, attemptConfig);
        const finalData = await this.interceptors.run('onSuccess', data);

        // If everything succeeds, clear the timeout and return the data.
        if (timeoutId) clearTimeout(timeoutId);
        return finalData;
        // --- End of main execution block ---
      } catch (error) {
        lastError = error; // Store the most recent error
        if (timeoutId) clearTimeout(timeoutId);

        // 3. Decide whether to retry or fail
        const isLastAttempt = attempt === maxRetries;
        if (isLastAttempt) {
          break; // Exit the loop and throw the last known error
        }

        const retryOn = config.retryOn ?? [];
        const isNetworkError =
          !error.response && retryOn.includes('network-error');
        const isRetryableStatus =
          error.status && retryOn.includes(error.status);

        if (isNetworkError || isRetryableStatus) {
          // If retryable, calculate delay and wait
          const delay = config.retryDelay ? config.retryDelay(attempt + 1) : 0;
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          continue; // Move to the next attempt
        } else {
          // If the error is not retryable, break the loop immediately
          break;
        }
      }
    }

    // 4. If the loop finished without a successful return, throw the final error
    const finalError = await this.interceptors.run('onError', lastError);
    throw finalError;
  }

  // --- Public Methods (Correctly Bound) ---

  get = async (url, options = {}) => {
    return this._request({ method: 'GET', url, ...options });
  };

  post = async (url, body, options = {}) => {
    return this._request({ method: 'POST', url, body, ...options });
  };

  put = async (url, body, options = {}) => {
    return this._request({ method: 'PUT', url, body, ...options });
  };

  patch = async (url, body, options = {}) => {
    return this._request({ method: 'PATCH', url, body, ...options });
  };

  delete = async (url, options = {}) => {
    return this._request({ method: 'DELETE', url, ...options });
  };
}
