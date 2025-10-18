// src/client/interceptors/LoggerInterceptor.js
import {BaseInterceptor} from './BaseInterceptor';

export class LoggerInterceptor extends BaseInterceptor {
  register(hooks, client) {
    this.client = client;

    hooks.add('request_setup', 'logger:setup', this._onSetup.bind(this), 900);
    hooks.add('before_fetch', 'logger:req', this._onBeforeFetch.bind(this), 999);
    hooks.add('final', 'logger:final', this._onFinal.bind(this), 999);
  }

  _shouldLog() {
    return !!this.client.config?.debug;
  }

  _onSetup(config) {
    if (!this._shouldLog()) return;
    try {
      const method = String(config?.method || '').toUpperCase();
      const url = config?.url;
      console.log(`[API Request] ${method} -> ${url}`);
    } catch {}
    return config;
  }

  _onBeforeFetch(fetchInit, {config}) {
    if (!this._shouldLog()) return fetchInit;
    try {
      const method = String(config?.method || fetchInit?.method || '').toUpperCase();
      const url = config?.url || fetchInit?.url;
      console.log(`[API Request] ${method} -> ${url}`);
    } catch {}
    return fetchInit;
  }

  _onFinal(payload) {
    if (!this._shouldLog()) return;
    try {
      if (payload.ok) {
        console.log('[API Success]', payload.data);
      } else {
        console.log('[API Error]', payload.error);
      }
    } catch {}
  }
}
