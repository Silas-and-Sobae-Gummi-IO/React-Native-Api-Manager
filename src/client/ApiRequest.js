// src/client/ApiRequest.js

import {buildRequestConfig} from './internals/requestBuilder';
import {mergeHeaders} from './../utils/headers';

export class ApiRequest {
  constructor(client, config) {
    this._client = client;
    this._config = config;
  }

  async init() {
    this._context = await this._runInterceptors('request:context', {value: {}});
    this._abortController = new AbortController();
    return this;
  }

  async send(overrides = {}) {
    const {url, options} = await this._runInterceptors('request:options', this._prepareConfigs(overrides));
    await this._runInterceptors('request:beforeRequest', undefined, {url, options});

    try {
      let response = await fetch(url, options);
      response = await this._runInterceptors('request:formatResponse', response);
      await this._runInterceptors('request:onResponse', response);

      return await this._runInterceptors('request:formatData', response);
    } catch (error) {
      error = await this._runInterceptors('request:formatError', error);
      await this._runInterceptors('request:onError', error);
      const needRethrow = await this._runInterceptors('request:rethrowError', false, {error});
      if (needRethrow !== false) throw needRethrow;
    } finally {
      await this._runInterceptors('request:comlete');
    }
  }

  abort(reason = 'manual') {
    if (this._abortController) this._abortController.abort(reason);
  }

  _prepareConfigs(overrides) {
    const headers = mergeHeaders(this._client.config.headers, this._config.headers, overrides.headers);

    return buildRequestConfig({
      signal: this._abortController.signal,
      ...this._client.config,
      ...this._config,
      body: {
        ...this._client.config.body,
        ...this._config.body,
        ...overrides,
      },
      headers,
    });
  }

  _runInterceptors(name, value = undefined, additionalContext = {}) {
    return this._client.interceptors.run(name, value, {client: this._client, config: this._config, context: this._context, ...additionalContext});
  }
}
