// src/client/interceptors/RetryInterceptor.js
import {BaseInterceptor} from './BaseInterceptor';

export class RetryInterceptor extends BaseInterceptor {
  register(hooks, client) {
    this.client = client;

    // Attach retry state early in the request lifecycle
    hooks.add('request_setup', 'retry:attach', this._attachContext.bind(this), 1);

    // Handle errors
    hooks.add('error', 'retry:onError', this._onError.bind(this), 50);
  }

  _attachContext(config, context) {
    // initialize retry state in context
    if (!context.retryState) {
      context.retryState = {tried: 0};
    }
    return config;
  }

  async _onError(error, context) {
    const {config, retryState} = context;
    const retryCfg = config?.retry || this.client.config?.retry || {attempts: 0};

    // if no retry config, bounce
    if (!retryCfg.attempts) return;

    const tried = retryState.tried;
    if (tried >= retryCfg.attempts) return;

    if (!this._shouldRetry(error, retryCfg.on)) return;

    // notify hooks about retry attempt
    await this.client.interceptors.run('retry_try', {attempt: tried + 1, error}, context);

    retryState.tried = tried + 1;

    // optional delay between retries
    const delay = typeof retryCfg.delay === 'function' ? retryCfg.delay(retryState.tried) : retryCfg.delay || 0;

    if (delay > 0) await new Promise((res) => setTimeout(res, delay));

    // re-dispatch the request
    return this.client._dispatchRequest(config, context);
  }

  _shouldRetry(error, onList) {
    if (!Array.isArray(onList) || !onList.length) return false;
    const isNetwork = !error || (!error.response && !error.status);
    if (isNetwork && onList.includes('network-error')) return true;

    const status = error?.status || error?.response?.status;
    if (status && onList.includes(status)) return true;

    return false;
  }
}
