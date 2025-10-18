// src/client/ApiClient.js

import {ApiRequest} from './ApiRequest';
import {InterceptorManager} from './InterceptorManager';
import {CoreInterceptor} from './interceptors/CoreInterceptor';

export class ApiClient {
  /**
   * @param {object} config Global config for this client
   *  { baseUrl, headers, hooks: {}, interceptors: [] }
   */
  constructor(config = {}) {
    this.config = config;
    this.interceptors = new InterceptorManager(this);

    // Register core interceptor
    this.interceptors.add('core', CoreInterceptor);

    // Register any user-provided interceptors
    if (Array.isArray(config.interceptors)) {
      for (const interceptor of config.interceptors) {
        this.interceptors.add(interceptor.constructor?.name || 'user', interceptor);
      }
    }

    // Run client_init hooks
    this.interceptors.run('client_init', this);
  }

  // Convenience methods
  get(config) {
    return new ApiRequest({...config, method: 'GET'}, this);
  }
  post(config) {
    return new ApiRequest({...config, method: 'POST'}, this);
  }
  put(config) {
    return new ApiRequest({...config, method: 'PUT'}, this);
  }
  delete(config) {
    return new ApiRequest({...config, method: 'DELETE'}, this);
  }
}
