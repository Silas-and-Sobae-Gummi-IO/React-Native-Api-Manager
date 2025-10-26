// src/client/ApiRequest.js

import {buildRequestConfig} from '../managers/requestBuilder';
import {ConfigManager} from '../managers/ConfigManager';

export class ApiRequest {
  constructor(client, config) {
    this._client = client;
    this._config = config;
    this._configManager = new ConfigManager(client.interceptors);
    this._context = {}; // Instance-level context, persists across send() calls
    this._abortController = new AbortController();
  }

  async send(bodyOverrides = {}) {
    // Run early initialization hook before config processing
    await this._runInterceptors('request:init', undefined, {request: this});

    // Merge configs using ConfigManager
    const mergedConfig = await this._configManager.prepare(this._client.config, this._config, bodyOverrides, this._abortController.signal);

    // Store full merged config in context (includes custom fields like cache, metrics, etc.)
    this._context.config = mergedConfig;

    // Build fetch params from merged config
    const {url, options} = buildRequestConfig(mergedConfig);
    await this._runInterceptors('request:beforeRequest', undefined, {url, options});

    let result;

    try {
      // Allow interceptors to skip fetch and return early (e.g., cache hit)
      const skipValue = await this._runInterceptors('request:skipFetch', null);
      if (skipValue !== null) {
        result = skipValue;
        return result;
      }

      // Allow interceptors to wrap/override how fetch is performed
      let performFetch = async (url, options) => fetch(url, options);
      performFetch = await this._runInterceptors('request:performFetch', performFetch, {url, options});

      let response = await performFetch(url, options);

      // Store response in context for interceptors
      this._context._response = response;

      response = await this._runInterceptors('request:formatResponse', response);
      await this._runInterceptors('request:onResponse', response);

      result = await this._runInterceptors('request:formatData', response);
      return result;
    } catch (error) {
      const formatted = await this._runInterceptors('request:formatError', error);
      // If a formatter returned a non-error value, treat it as a recovered result
      if (!this._isErrorLike(formatted)) {
        result = formatted;
        return result;
      }
      error = formatted;
      await this._runInterceptors('request:onError', error);
      const shouldSuppress = await this._runInterceptors('request:suppressError', false, {error});
      if (!shouldSuppress) throw error;
    } finally {
      await this._runInterceptors('request:complete', undefined, {request: this});
    }
  }

  abort(reason = 'manual') {
    if (this._abortController) this._abortController.abort(reason);
  }

  _runInterceptors(name, value = undefined, additionalContext = {}) {
    // Pass merged config if available, otherwise fall back to request config
    const config = this._context.config || this._config;
    return this._client.interceptors.run(name, value, {client: this._client, config, context: this._context, ...additionalContext});
  }

  /**
   * Check if value is an error or error-like object
   * Error-like objects have both 'name' and 'message' properties (e.g., DOMException)
   */
  _isErrorLike(value) {
    return value instanceof Error || 
           (value && typeof value === 'object' && 'name' in value && 'message' in value);
  }
}
