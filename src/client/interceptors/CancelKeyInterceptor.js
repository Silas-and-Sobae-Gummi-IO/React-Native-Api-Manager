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
    // Hook early to capture and cancel previous requests
    this._manager.add('request:context', 'cancelKey:setup', this._onSetup.bind(this), 1);
    
    // Hook late to clean up completed requests
    this._manager.add('request:complete', 'cancelKey:cleanup', this._onCleanup.bind(this), 999);
  }

  _onSetup(contextValue, hookContext) {
    const {config, request} = hookContext;
    const cancelKey = config?.cancelKey;

    if (!cancelKey) {
      return contextValue;
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

    return contextValue;
  }

  _onCleanup(hookContext) {
    // request:complete is called with undefined value, so hookContext is the first param
    const {config, request} = hookContext;
    const cancelKey = config?.cancelKey;

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
