// src/client/ApiClient.js

import {InterceptorManager} from './internals/InterceptorManager';
import {buildRequestConfig} from './internals/requestBuilder';
import {parseResponse} from './internals/responseParser';
import {ApiError} from '../core/ApiError';
import {parseShorthandUrl, parseInterceptorShorthand} from '../utils/parser';
import {mergeHeaders} from '../utils/headers';
import {CoreInterceptor} from './interceptors/CoreInterceptor';
import {ApiRequest} from './ApiRequest';

/**
 * ApiClient
 * A hooks-driven HTTP client for modern JS apps.
 * - Exposes WordPress-like filters/actions via InterceptorManager
 * - Returns ApiRequest handles for manual aborts
 */
export class ApiClient {
/**
   * Create a new ApiClient instance.
   *
   * Built-in config (documented):
   * - baseURL?: string
   * - headers?: Record<string,string>
   * - timeout?: number (ms)
   * - debug?: boolean
   * - retry?: { attempts?: number, on?: Array<number|'network-error'>, delay?: (attempt:number)=>number }
   */
  constructor(config = {}) {
    this.config = config;
    this.interceptors = new InterceptorManager(this);
    this.cancellableRequests = new Map();

    // Register core and fire init
    this.interceptors.add('core', CoreInterceptor);
    this.interceptors.doAction('client_init', this, {client: this});
  }

  /**
   * Prepare the full config by merging instance + request, then allowing interceptors to fill defaults & adjust.
   */
/**
   * Build the per-request config by merging instance + user config and running filters.
   * @param {object} userConfig
   * @param {object} requestContext
   * @returns {Promise<object>}
   * @private
   */
  async _prepareConfig(userConfig, requestContext) {
    const mergedHeaders = mergeHeaders(this.config.headers || {}, userConfig.headers || {});
    let cfg = {...this.config, ...userConfig, headers: mergedHeaders};
    cfg = await this.interceptors.applyFilters('config', cfg, requestContext);
    const filteredHeaders = await this.interceptors.applyFilters('headers', cfg.headers, {...requestContext, config: cfg});
    cfg.headers = filteredHeaders || cfg.headers;
    return cfg;
  }

  /**
   * Entry point: compute final config via interceptors, then execute one attempt; retries handled by RetryInterceptor.
   */
/**
   * Public entry: create a request handle and start dispatching through the pipeline.
   * @param {object} userConfig
   * @returns {import('./ApiRequest').ApiRequest}
   */
  _request(userConfig) {
    const requestContext = {
      client: this,
      requestId: Symbol('request'),
      userAborted: false,
    };
    const run = async () => {
      const cfg = await this._prepareConfig(userConfig, requestContext);
      requestContext.config = cfg;
      return this._dispatchRequest(cfg, requestContext, handle);
    };
    const handle = ApiRequest.fromPromiseFactory(run);
    return handle;
  }

  /**
   * One attempt lifecycle; errors are routed to onError hooks which may return a replacement result or retry via ctx.retry.
   */
/**
   * Dispatch a single network request through the pipeline.
   * Handles AbortController wiring, hooks, parsing, and finalization.
   * @param {object} config
   * @param {object} requestContext
   * @param {import('./ApiRequest').ApiRequest} handle
   * @returns {Promise<any>}
   * @private
   */
  async _dispatchRequest(config, requestContext, handle) {
    const {controller, timeoutId} = this._setupAttempt(config);
    requestContext.abortController = controller;
    if (handle && typeof handle.setAbort === 'function') {
      handle.setAbort(() => {
        requestContext.userAborted = true;
        try {
          controller.abort('manual');
        } catch (_) {}
      });
    }

    // Bridge user-provided signal for manual aborts
    if (config.signal) {
      try {
        config.signal.addEventListener(
          'abort',
          () => {
            requestContext.userAborted = true;
            controller.abort('manual');
          },
          {once: true}
        );
      } catch (_) {}
    }

    // Allow plugins like CancelKey to prepare per-attempt state
    await this.interceptors.doAction('request_setup', {config}, requestContext);

    try {
      const attemptConfig = {...config, signal: controller.signal};
      const preppedConfig = await this.interceptors.applyFilters('request', attemptConfig, requestContext);

      let fetchInit = buildRequestConfig(preppedConfig);
      fetchInit =
        (await this.interceptors.applyFilters('before_fetch', fetchInit, {
          ...requestContext,
          config: preppedConfig,
        })) || fetchInit;

      const {url: finalUrl, ...fetchOptions} = fetchInit;
      let response = await fetch(finalUrl, fetchOptions);
      response = (await this.interceptors.applyFilters('fetch_response', response, requestContext)) || response;

      let data = await parseResponse(response, preppedConfig);
      data = (await this.interceptors.applyFilters('after_parse', data, requestContext)) || data;

      const out = await this.interceptors.applyFilters('success', data, requestContext);
      await this.interceptors.doAction('final', {ok: true, data: out}, requestContext);
      return out;
    } catch (error) {
      // Manual abort: rethrow AbortError untouched
      if (error?.name === 'AbortError' && (controller.signal.reason === 'manual' || requestContext.userAborted)) {
        throw error;
      }
      // Timeout abort => wrap
      if (error?.name === 'AbortError' && controller.signal.reason === 'timeout') {
        error = new ApiError(`Request timed out after ${config.timeout}ms`, config);
      }

      const maybe = await this.interceptors.applyFilters('error', error, requestContext);
      await this.interceptors.doAction('final', {ok: false, error: maybe || error}, requestContext);

      if (maybe === undefined) throw error;
      if (maybe instanceof Error) throw maybe;
      return maybe;
    } finally {
      this._cleanupAttempt(config, timeoutId);
    }
  }

/**
   * Create AbortController and timeout for a request.
   * @param {object} config
   * @returns {{ controller: AbortController, timeoutId: any }}
   * @private
   */
  _setupAttempt(config) {
    const controller = new AbortController();
    let timeoutId = null;

    if (config.timeout) {
      timeoutId = setTimeout(() => {
        controller.abort('timeout');
      }, config.timeout);
    }

    return {controller, timeoutId};
  }

/**
   * Cleanup timeout after request completes.
   * @param {object} config
   * @param {any} timeoutId
   * @private
   */
  _cleanupAttempt(config, timeoutId) {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // --- Public Request Methods ---
  get = (url, options = {}) => this._request({method: 'GET', url, ...options});
  post = (url, body, options = {}) => this._request({method: 'POST', url, body, ...options});
  put = (url, body, options = {}) => this._request({method: 'PUT', url, body, ...options});
  patch = (url, body, options = {}) => this._request({method: 'PATCH', url, body, ...options});
  delete = (url, options = {}) => this._request({method: 'DELETE', url, ...options});

  request = (shorthand, ...args) => {
    const initial = parseShorthandUrl(shorthand);
    const promiseParsed = this.interceptors.applyFilters('shorthand', initial, {
      client: this,
    });
    // allow filters to be async; wrap in ApiRequest when resolved
    const wrap = async () => {
      const parsed = (await promiseParsed) || initial;
      const bodyMethods = new Set(['post', 'put', 'patch']);
      const [maybeBody, maybeOptions] = args;
      const options = bodyMethods.has(parsed.method) ? maybeOptions || {} : maybeBody || {};
      const body = bodyMethods.has(parsed.method) ? maybeBody : undefined;
      return bodyMethods.has(parsed.method) ? this[parsed.method](parsed.url, body, options) : this[parsed.method](parsed.url, options);
    };
    return ApiRequest.fromPromiseFactory(wrap);
  };

  configureInterceptor = (name, InterceptorClass) => {
    // simpler API: add/remove by name
    if (!InterceptorClass) throw new Error('Provide an interceptor class');
    this.interceptors.add(name, InterceptorClass);
  };

  // Convenience hook registration APIs
  addFilter = (hookName, name, callback, priority = 10) => this.interceptors.addFilter(hookName, name, callback, priority)
  removeFilter = (hookName, name) => this.interceptors.removeFilter(hookName, name)
  addAction = (hookName, name, callback, priority = 10) => this.interceptors.addAction(hookName, name, callback, priority)
  removeAction = (hookName, name) => this.interceptors.removeAction(hookName, name)

  abort = (handleOrId) => {
    if (!handleOrId) return;
    if (typeof handleOrId.abort === 'function') return handleOrId.abort();
  };

  // --- Private helpers ---
  async _prepareConfig(userConfig, requestContext) {
    const mergedHeaders = mergeHeaders(this.config.headers || {}, userConfig.headers || {});
    let cfg = {...this.config, ...userConfig, headers: mergedHeaders};
    cfg = await this.interceptors.applyFilters('config', cfg, requestContext);
    const filteredHeaders = await this.interceptors.applyFilters('headers', cfg.headers, {...requestContext, config: cfg});
    cfg.headers = filteredHeaders || cfg.headers;
    return cfg;
  }
}
