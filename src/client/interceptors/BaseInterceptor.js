// src/client/interceptors/BaseInterceptor.js

export class BaseInterceptor {
  register(hooks, client) {
    this.hooks = hooks;
    this.client = client;
    if (typeof this.onRegister === 'function') this.onRegister();
  }
}
