// src/client/interceptors/LoggerInterceptor.js

import { BaseInterceptor } from './BaseInterceptor';

/**
 * LoggerInterceptor
 * Logs request and final result when client.config.debug is true.
 */
export class LoggerInterceptor extends BaseInterceptor {
  register(hooks, client) {
    this.hooks = hooks;
    this.client = client;
    hooks.addAction('before_fetch', 'logger:req', this._onBeforeFetch, 999);
    hooks.addAction('final', 'logger:final', this._onFinal, 999);
  }

  _shouldLog() {
    return !!this.client.config?.debug;
  }

  _onBeforeFetch = (fetchInit, context) => {
    if (!this._shouldLog()) return;
    try {
      const method = String(context?.config?.method || fetchInit?.method || '').toUpperCase();
      const url = context?.config?.url || fetchInit?.url;
      console.log(`[API Request] ${method} -> ${url}`);
    } catch (_) {}
  };

  _onFinal = (payload) => {
    if (!this._shouldLog()) return;
    try {
      if (payload.ok) console.log('[API Success]', payload.data);
      else console.log('[API Error]', payload.error);
    } catch (_) {}
  };
}
