/**
 * BaseInterceptor
 * - All interceptors must extend this.
 */
export class BaseInterceptor {
  init(manager, client) {
    this._manager = manager;
    this._client = client;

    this.register();
    return this;
  }

  register() {
    throw new Error('Interceptor must implement register(hooks, client)');
  }
}
