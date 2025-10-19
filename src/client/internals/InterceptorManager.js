/**
 * InterceptorManager
 * - Unified hook system
 * - add/remove single hook
 * - attach/detach class-based providers
 * - run hook chain
 */
import {BaseInterceptor} from '../interceptors/BaseInterceptor';

export class InterceptorManager {
  constructor(client) {
    this.client = client;
    this.hooks = new Map(); // hookName -> [{name, cb, priority}]
    this.providers = new Map(); // providerName -> instance
  }

  add(hookName, name, callback, priority = 10) {
    const list = this.hooks.get(hookName) || [];
    list.push({name, callback, priority});
    list.sort((a, b) => a.priority - b.priority);
    this.hooks.set(hookName, list);
  }

  remove(hookName, name) {
    const list = this.hooks.get(hookName) || [];
    this.hooks.set(
      hookName,
      list.filter((i) => i.name !== name)
    );
  }

  /**
   * Attach a class-based interceptor provider
   * @param {string} name
   * @param {class} Provider - must extend BaseInterceptor
   */
  attach(Provider, name = undefined) {
    if (typeof Provider !== 'function') {
      throw new Error(`Invalid provider: ${name ?? '(unnamed)'} must be a class`);
    }

    const providerKey = name || Provider.name;

    if (!providerKey) {
      throw new Error('Anonymous providers must be attached with an explicit name.');
    }

    if (this.providers.has(providerKey)) {
      return this.providers.get(providerKey);
    }

    if (!(Provider.prototype instanceof BaseInterceptor)) {
      throw new Error(`Provider ${providerKey} must extend BaseInterceptor`);
    }

    const instance = new Provider().init(this, this.client);
    this.providers.set(providerKey, instance);
    return instance;
  }

  detach(name) {
    const instance = this.providers.get(name);
    if (!instance) return;

    const prefix = `${name}:`;
    for (const [hookName, list] of this.hooks.entries()) {
      this.hooks.set(
        hookName,
        list.filter((i) => !i.name.startsWith(prefix))
      );
    }

    this.providers.delete(name);
  }

  async run(hookName, value = undefined, context = {}) {
    const list = this.hooks.get(hookName) || [];
    let out = value;

    for (const item of list) {
      const result = await (typeof value == 'undefined' ? item.callback(context) : item.callback(out, context));
      if (typeof result !== 'undefined') {
        out = result;
      }
    }

    return out;
  }
}
