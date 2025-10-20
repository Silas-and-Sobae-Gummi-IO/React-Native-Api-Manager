// src/client/ApiRequest.js

import {buildRequestConfig} from './lib/requestBuilder';
import {mergeHeaders} from './../utils/headers';

export class ApiRequest {
  constructor(client, config) {
    this._client = client;
    this._config = config;
  }

  init() {
    this._context = {};  // Instance-level context, persists across send() calls
    this._abortController = new AbortController();
    return this;
  }

  async send(bodyOverrides = {}) {
    // Run early initialization hook before config processing
    await this._runInterceptors('request:init', undefined, {request: this});

    const preparedConfig = await this._prepareConfigs(bodyOverrides);
    const {url, options} = await this._runInterceptors('request:options', preparedConfig);
    await this._runInterceptors('request:beforeRequest', undefined, {url, options});

    try {
      let response = await fetch(url, options);
      response = await this._runInterceptors('request:formatResponse', response);
      await this._runInterceptors('request:onResponse', response);

      return await this._runInterceptors('request:formatData', response);
    } catch (error) {
      error = await this._runInterceptors('request:formatError', error);
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

  async _prepareConfigs(bodyOverrides) {
    // Get defaults from interceptors via request:defaultConfig hook
    const defaultConfig = await this._runInterceptors('request:defaultConfig', {});

    const headers = mergeHeaders(
      defaultConfig.headers,
      this._client.config.headers,
      this._config.headers
    );

    // Body merging - merge plain objects only (FormData conversion happens in buildRequestConfig)
    let finalBody = undefined;
    
    // Start with client-level body (should always be plain object)
    if (this._client.config.body) {
      finalBody = {...this._client.config.body};
    }
    
    // Merge or replace with request-level body
    if (this._config.body !== undefined) {
      if (this._config.body instanceof FormData) {
        // FormData replaces everything, can't merge
        finalBody = this._config.body;
      } else if (typeof this._config.body === 'object' && this._config.body !== null) {
        finalBody = {...(finalBody || {}), ...this._config.body};
      } else {
        finalBody = this._config.body;
      }
    }
    
    // Merge or replace with send-time overrides
    if (Object.keys(bodyOverrides).length > 0) {
      if (bodyOverrides instanceof FormData) {
        // FormData replaces everything, can't merge
        finalBody = bodyOverrides;
      } else if (typeof bodyOverrides === 'object' && bodyOverrides !== null) {
        finalBody = {...(finalBody || {}), ...bodyOverrides};
      } else {
        finalBody = bodyOverrides;
      }
    }

    return buildRequestConfig({
      ...defaultConfig,              // Defaults from interceptors
      signal: this._abortController.signal,
      ...this._client.config,        // Client-level config
      ...this._config,               // Request-level config
      body: finalBody,
      headers,
    });
  }

  _runInterceptors(name, value = undefined, additionalContext = {}) {
    return this._client.interceptors.run(name, value, {client: this._client, config: this._config, context: this._context, ...additionalContext});
  }
}
