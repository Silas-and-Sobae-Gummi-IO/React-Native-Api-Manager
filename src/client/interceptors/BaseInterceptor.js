// src/client/interceptors/BaseInterceptor.js

/**
 * BaseInterceptor
 * Convenience base class giving access to this.hooks and this.client.
 */
export class BaseInterceptor {
  register(hooks, client) {
    this.hooks = hooks;
    this.client = client;
    if (typeof this.onRegister === 'function') this.onRegister();
  }
}
