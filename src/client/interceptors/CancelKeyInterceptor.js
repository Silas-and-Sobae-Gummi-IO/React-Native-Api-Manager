// src/client/interceptors/CancelKeyInterceptor.js

import { BaseInterceptor } from './BaseInterceptor';

export class CancelKeyInterceptor extends BaseInterceptor {
  register(hooks, client) {
    this.hooks = hooks;
    this.client = client;
    this.map = new Map();

    hooks.addAction('request_setup', 'cancelkey:setup', this._onSetup, 5);
    hooks.addAction('final', 'cancelkey:cleanup', this._onCleanup, 50);
  }

  _onSetup = ({ config }, requestContext) => {
    const key = config?.cancelKey;
    if (!key) return;
    const prev = this.map.get(key);
    if (prev && prev !== requestContext.abortController) {
      try { prev.abort('cancelKey'); } catch (_) {}
    }
    this.map.set(key, requestContext.abortController);
  };

  _onCleanup = (payload, requestContext) => {
    const key = requestContext?.config?.cancelKey;
    if (!key) return;
    const current = this.map.get(key);
    if (current === requestContext.abortController) this.map.delete(key);
  };
}
