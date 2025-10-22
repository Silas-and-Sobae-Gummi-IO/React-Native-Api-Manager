// src/client/interceptors/RetryInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';

export class RetryInterceptor extends BaseInterceptor {
  static name = 'retry';
  static defaultConfig = {
    enable: false,
    maxAttempts: 3,
    methods: ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'],
    retryOn: [429, 500, 502, 503, 504],
    backoff: {
      type: 'exponential', // 'fixed' | 'exponential'
      base: 300,           // ms
      jitter: 'full',      // 'none' | 'full'
    },
  };

  configKey = 'retry';

  register() {
    this._useShorthandConfig();
    // Wrap fetch execution to perform retries entirely within the interceptor
    this._manager.add('request:performFetch', this._wrapPerformFetch.bind(this), 50, 'retry:wrap');
  }

  _wrapPerformFetch(performFetch, {url, options, config, context}) {
    if (!this._isEnabled(config) || !this._isMethodAllowed(config)) {
      return performFetch;
    }

    const self = this;
    return async function wrappedPerform(url, options) {
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        attempt += 1;
        context._retryAttempt = attempt;
        try {
          const resp = await performFetch(url, options);
          // Make response visible to retry predicate
          const prevResp = context._response;
          context._response = resp;
          const shouldRetry = self._shouldRetryResponse(false, {config, context});
          // Restore previous response (ApiRequest will set real one afterwards)
          context._response = prevResp;
          if (shouldRetry) {
            const delay = self._getDelay(0, {config, context});
            if (delay && delay > 0) await new Promise(r => setTimeout(r, delay));
            continue;
          }
          return resp;
        } catch (err) {
          if (self._shouldRetryError(false, {config, context, error: err})) {
            const delay = self._getDelay(0, {config, context});
            if (delay && delay > 0) await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
    };
  }

  _isEnabled(config) {
    return config.retry && config.retry.enable === true;
  }

  _isMethodAllowed(config) {
    const method = (config.method || 'GET').toUpperCase();
    const allowed = config.retry.methods || [];
    return allowed.includes(method);
  }

  _withinAttempts(context, config) {
    const attempt = context._retryAttempt || 1;
    const max = config.retry.maxAttempts || 1;
    return attempt < max; // allow retry if next attempt would be <= max
  }

  _matchesStatus(response, config) {
    const {retryOn} = config.retry;
    if (typeof retryOn === 'function') return !!retryOn(response);
    const list = Array.isArray(retryOn) ? retryOn : [];
    return list.includes(response.status);
  }

  _shouldRetryResponse(shouldRetry, {config, context}) {
    if (!this._isEnabled(config)) return false;
    if (!this._isMethodAllowed(config)) return false;
    const resp = context._response;
    if (!resp) return false;
    if (!this._withinAttempts(context, config)) return false;
    return this._matchesStatus(resp, config);
  }

  _shouldRetryError(shouldRetry, {config, context, error}) {
    if (!this._isEnabled(config)) return false;
    if (!this._isMethodAllowed(config)) return false;
    if (!this._withinAttempts(context, config)) return false;
    // Network errors or aborted? Retry network-like errors, skip manual aborts
    if (error && (error.name === 'AbortError' || error.message === 'manual')) return false;
    return true;
  }

  _getDelay(currentDelay, {config, context}) {
    if (!this._isEnabled(config)) return 0;
    const attempt = (context._retryAttempt || 1);
    const {backoff} = config.retry;
    const type = backoff?.type || 'exponential';
    const base = backoff?.base ?? 300;
    const jitter = backoff?.jitter || 'full';

    let delay = base;
    if (type === 'exponential') {
      delay = base * Math.pow(2, Math.max(0, attempt - 1));
    }

    if (jitter === 'full') {
      delay = Math.floor(Math.random() * delay);
    }

    return delay;
  }
}
