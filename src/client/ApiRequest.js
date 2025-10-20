// src/client/ApiRequest.js

import {buildRequestConfig} from './lib/requestBuilder';
import {mergeHeaders} from './../utils/headers';

export class ApiRequest {
  constructor(client, config) {
    this._client = client;
    this._config = config;
  }

  init() {
    this._context = {};
    this._abortController = new AbortController();
    return this;
  }

  async send(bodyOverrides = {}) {
    // Build context from hooks (can be async)
    this._context = await this._runInterceptors('request:context', {value: {}}, {request: this});

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

    // Body merging - bodyOverrides IS the body data, merge with existing body
    let finalBody = this._client.config.body;
    
    if (this._config.body !== undefined) {
      if (typeof this._config.body === 'object' && !(this._config.body instanceof FormData)) {
        finalBody = {...finalBody, ...this._config.body};
      } else {
        finalBody = this._config.body;
      }
    }
    
    // bodyOverrides is the actual body data from send(), merge it
    if (Object.keys(bodyOverrides).length > 0) {
      if (typeof bodyOverrides === 'object' && !(bodyOverrides instanceof FormData)) {
        finalBody = {...finalBody, ...bodyOverrides};
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
