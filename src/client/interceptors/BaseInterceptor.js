/**
 * BaseInterceptor
 * - All interceptors must extend this.
 */
export class BaseInterceptor {
  register(hooks, client) {
    throw new Error('Interceptor must implement register(hooks, client)');
  }
}
