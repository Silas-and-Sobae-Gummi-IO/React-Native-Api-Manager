// src/client/interceptors/RetryInterceptor.js

import { BaseInterceptor } from './BaseInterceptor';

export class RetryInterceptor extends BaseInterceptor {
  register(hooks, client) {
    this.hooks = hooks;
    this.client = client;
    hooks.addFilter('error', 'retry:filter', this._onError, 50);
    hooks.addFilter('request', 'retry:attach-config', this._attachConfig, 1);
  }

  _onError = async (error, requestContext) => {
    const cfg = requestContext?.config || this.client.config || {};
    const retryCfg = cfg.retry || { attempts: 0, on: [], delay: () => 0 };

    if (!requestContext.retryState) requestContext.retryState = { tried: 0 };
    const tried = requestContext.retryState.tried;
    if (tried >= retryCfg.attempts) return undefined;

    const shouldRetry = this._shouldRetry(error, retryCfg.on);
    if (!shouldRetry) return undefined;

    await this.hooks.doAction('retry_try', { attempt: tried + 1, error }, requestContext);

    requestContext.retryState.tried = tried + 1;
    const delay = typeof retryCfg.delay === 'function' ? retryCfg.delay(requestContext.retryState.tried) : 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    return this.client._dispatchRequest(requestContext.config, requestContext);
  };

  _attachConfig = (attemptConfig, requestContext) => {
    requestContext.config = attemptConfig;
    return attemptConfig;
  };

  _shouldRetry(error, onList) {
    if (!Array.isArray(onList)) return false;
    const isNetwork = !error || (!error.response && !error.status);
    if (isNetwork && onList.includes('network-error')) return true;
    const status = error?.status || error?.response?.status;
    if (status && onList.includes(status)) return true;
    return false;
  }
}
