// src/client/ApiClient.js

import {InterceptorManager} from './internals/InterceptorManager';
import {parseShorthandUrl} from '../utils/parser';
import {CoreInterceptor} from './interceptors/CoreInterceptor';
import {ApiRequest} from './ApiRequest';

export class ApiClient {
  constructor(config = {}) {
    this.config = config;
    this.interceptors = new InterceptorManager(this);

    // Register core and fire init
    this._registerInterceptorsAndHooks();
    this.interceptors.run('client:init', this, {client: this});
  }

  get = (url, options = {}) => this._request({method: 'GET', url, ...options});
  post = (url, body, options = {}) => this._request({method: 'POST', url, body, ...options});
  put = (url, body, options = {}) => this._request({method: 'PUT', url, body, ...options});
  patch = (url, body, options = {}) => this._request({method: 'PATCH', url, body, ...options});
  delete = (url, options = {}) => this._request({method: 'DELETE', url, ...options});
  request = (url, options = {}) => this._request({...options, ...parseShorthandUrl(url)});

  _registerInterceptorsAndHooks() {
    // Attach Core first (this registers built-in interceptors like logger)
    this.interceptors.attach(CoreInterceptor);

    // Process user's interceptors (can remove built-ins with '-name')
    if (this.config?.interceptors) {
      this.interceptors.processInterceptors(this.config.interceptors);
    }

    // Register individual hooks from config
    Object.entries(this.config?.hooks || {}).forEach(([key, value]) => {
      // onSuccess[key]@2o, -onSuccess[key], ~onSuccess[key]
      const [name, callback, priority = 10] = value;
      this.interceptors.add(key, name, callback, priority);
    });
  }

  _request(config) {
    const request = new ApiRequest(this, config);
    return request.init();
  }
}
