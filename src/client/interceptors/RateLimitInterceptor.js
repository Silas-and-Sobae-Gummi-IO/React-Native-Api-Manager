// src/client/interceptors/RateLimitInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';

/**
 * RateLimitInterceptor
 *
 * Limits the rate of outgoing requests with queuing support.
 *
 * Usage:
 *   const client = new ApiClient({
 *     rateLimit: {
 *       enable: true,
 *       maxRequests: 10,    // max requests
 *       window: 1000,       // per 1 second
 *       strategy: 'sliding', // 'sliding' or 'fixed'
 *       scope: 'global',     // 'global' or 'per-endpoint'
 *       onRateLimit: (waitTime) => console.log('Rate limited, waiting', waitTime, 'ms')
 *     }
 *   });
 */
export class RateLimitInterceptor extends BaseInterceptor {
  static name = 'rateLimit';
  static defaultConfig = {
    enable: false,
    maxRequests: 10,
    window: 1000, // 1 second
    strategy: 'sliding',
    scope: 'global',
    onRateLimit: null,
  };

  configKey = 'rateLimit';

  constructor() {
    super();
    this._timestamps = new Map(); // endpoint -> timestamps[]
  }

  register() {
    // Use standardized shorthand normalization hooks
    this._useShorthandConfig();
    this._manager.add('request:beforeRequest', 'rateLimit:check', this._checkRateLimit.bind(this), 30);
  }

  // Kept for backward-compatibility in tests; mirrors Base default behavior
  _setDefaults(config) {
    const val = config.rateLimit;
    const normalized = val === true
      ? { enable: true }
      : val === false
      ? { enable: false }
      : (typeof val === 'object' && val !== null ? val : {});

    return {
      ...config,
      rateLimit: {
        ...this.constructor.defaultConfig,
        ...normalized,
      },
    };
  }

  _shouldRateLimit(config) {
    return config.rateLimit.enable === true;
  }

  _getScope(config, url) {
    const scope = config.rateLimit.scope;
    if (scope === 'global') {
      return '__global__';
    }
    // per-endpoint: use base URL without query params
    return this._extractBaseUrl(url);
  }

  _extractBaseUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  async _checkRateLimit({url, config}) {
    if (!this._shouldRateLimit(config)) {
      return;
    }

    const scope = this._getScope(config, url);
    const rateLimitConfig = config.rateLimit;

    // Acquire a slot (waits if necessary and records immediately upon acquire)
    await this._acquireSlot(scope, rateLimitConfig);
  }

  async _acquireSlot(scope, config) {
    const {maxRequests, window, strategy} = config;

    return new Promise(resolve => {
      const tryAcquire = () => {
        const now = Date.now();
        const timestamps = this._timestamps.get(scope) || [];

        // Clean old timestamps based on strategy
        const validTimestamps = this._cleanTimestamps(timestamps, now, window, strategy);

        // Check if we can proceed
        if (validTimestamps.length < maxRequests) {
          // Record immediately upon acquire to prevent race conditions
          validTimestamps.push(now);
          this._timestamps.set(scope, validTimestamps);
          resolve();
          return true;
        }

        // Rate limited - calculate wait time
        const oldestTimestamp = validTimestamps[0];
        const waitTime = strategy === 'sliding'
          ? Math.max(0, oldestTimestamp + window - now)
          : Math.max(0, window - (now % window));

        // Store cleaned timestamps back
        this._timestamps.set(scope, validTimestamps);

        // Call user callback if provided
        if (typeof config.onRateLimit === 'function') {
          try {
            config.onRateLimit(waitTime);
          } catch {
            // Silently catch errors in user callback
          }
        }

        // Wait and try again
        setTimeout(tryAcquire, waitTime);
        return false;
      };

      tryAcquire();
    });
  }

  _cleanTimestamps(timestamps, now, window, strategy) {
    if (strategy === 'sliding') {
      // Remove timestamps older than window
      return timestamps.filter(ts => now - ts < window);
    } else {
      // Fixed window: remove timestamps from previous windows
      const currentWindowStart = Math.floor(now / window) * window;
      return timestamps.filter(ts => ts >= currentWindowStart);
    }
  }

  // Deprecated: recording happens inside _acquireSlot to avoid races
  _recordRequest() {}

  // Utility methods for testing/debugging
  _getRequestCount(scope) {
    const timestamps = this._timestamps.get(scope) || [];
    return timestamps.length;
  }

  _clearScope(scope) {
    this._timestamps.delete(scope);
  }

  _clearAll() {
    this._timestamps.clear();
  }
}
