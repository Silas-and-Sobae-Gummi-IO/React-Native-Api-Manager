// src/client/ApiRequest.js

export class ApiRequest {
  /**
   * @param {object} config Request config {uri, method, params, headers, ...}
   * @param {ApiClient} client
   */
  constructor(config, client) {
    this.client = client;
    this.config = config;
    this._context = {}; // per-request context for interceptors
    this._abortController = config.abortController || null;
  }

  /**
   * Abort the request
   */
  abort(reason = 'manual') {
    if (this._abortController) this._abortController.abort(reason);
  }

  /**
   * Send the request
   * @param {object} overrides Only overrides POST body or params
   */
  async send(overrides = {}) {
    // Merge overrides into params/body only
    const mergedConfig = {...this.config, ...overrides};
    this._context.config = mergedConfig;
    this._abortController ||= new AbortController();
    this._context.abortController = this._abortController;

    // Run setup hook
    await this.client.interceptors.run('request_setup', mergedConfig, this._context);

    // Run before_fetch filters
    const finalConfig = await this.client.interceptors.run('before_fetch', mergedConfig, this._context);

    let res, data, error;
    try {
      const url = finalConfig.uri.startsWith('http') ? finalConfig.uri : (this.client.config.baseUrl || '') + finalConfig.uri;

      const fetchOptions = {
        method: finalConfig.method,
        headers: {...(this.client.config.headers || {}), ...(finalConfig.headers || {})},
        body: finalConfig.body ? JSON.stringify(finalConfig.body) : undefined,
        signal: this._abortController,
      };

      res = await fetch(url, fetchOptions);
      data = await res.json().catch(() => null);
    } catch (err) {
      error = err;
    }

    const payload = error ? {ok: false, error} : {ok: true, data, status: res?.status};

    // Run final hook
    await this.client.interceptors.run('final', payload, this._context);

    if (error) throw error;
    return payload;
  }
}
