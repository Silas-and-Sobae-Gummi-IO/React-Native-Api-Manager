// src/client/interceptors/CancelKeyInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';

export class CancelKeyInterceptor extends BaseInterceptor {
  constructor() {
    super();
    this.map = new Map();
  }

  register(hooks, client) {
    hooks.addAction('request_setup', 'cancelkey:setup', this._onSetup, 5);
    hooks.addAction('done', 'cancelkey:cleanup', this._onCleanup, 50);
  }

  _onSetup = ({config}, ctx) => {
    const key = config?.cancelKey;
    if (!key) return;

    const prev = this.map.get(key);
    if (prev && prev !== ctx.abortController) {
      try {
        prev.abort('cancelKey');
      } catch (_) {}
    }

    this.map.set(key, ctx.abortController);
  };

  _onCleanup = (_payload, ctx) => {
    const key = ctx.config?.cancelKey;
    if (!key) return;

    const current = this.map.get(key);
    if (current === ctx.abortController) {
      this.map.delete(key);
    }
  };
}
