// src/client/interceptors/CancelKeyInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';

/**
 * CancelKeyInterceptor
 *
 * Automatically cancels previous pending requests with the same cancelKey.
 *
 * Use case: Search autocomplete, rapid API calls where only the latest matters.
 *
 * Usage:
 *   client.get('/search', { cancelKey: 'search', params: { q: 'abc' } })
 *   client.get('/search', { cancelKey: 'search', params: { q: 'abcd' } }) // Cancels previous
 */
export class CancelKeyInterceptor extends BaseInterceptor {
  static name = 'cancelKey';

  constructor() {
    super();
    this._cancelMap = new Map(); // cancelKey -> AbortController
  }

  register() {
    // Set default config for JSON APIs
    this._manager.add('request:defaultConfig', this._setDefaults.bind(this), 10, 'cancelKey:defaults');

    // Hook early to capture and cancel previous requests before config processing
    this._manager.add('request:init', this._onSetup.bind(this), 1, 'cancelKey:setup');

    // Hook late to clean up completed requests
    this._manager.add('request:complete', this._onCleanup.bind(this), 999, 'cancelKey:cleanup');
  }

  _setDefaults(config) {
    // Don't override user-provided cancelKey
    return {
      ...config,
      cancelKey: config.cancelKey !== undefined ? config.cancelKey : null,
    };
  }

  _onSetup(hookContext) {
    // request:init receives undefined as value, hookContext is first param
    // Note: config from hookContext is the request-level config, not merged yet
    const {config, request} = hookContext;
    const cancelKey = config?.cancelKey;

    if (!cancelKey) {
      return;
    }

    // Check if there's a previous request with this key
    const prevController = this._cancelMap.get(cancelKey);
    if (prevController && prevController !== request._abortController) {
      try {
        prevController.abort('cancelKey');
      } catch (e) {
        // Ignore abort errors
      }
    }

    // Store the current request's abort controller
    this._cancelMap.set(cancelKey, request._abortController);
  }

  _onCleanup(hookContext) {
    // request:complete is called with undefined value, so hookContext is the first param
    // Get cancelKey from context.config (merged config) not hookContext.config
    const {context, request} = hookContext;
    const cancelKey = context.config?.cancelKey;

    if (!cancelKey) {
      return;
    }

    // Only clean up if this is the current request for this key
    const current = this._cancelMap.get(cancelKey);
    if (current === request._abortController) {
      this._cancelMap.delete(cancelKey);
    }
  }
}
