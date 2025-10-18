/**
 * InterceptorManager
 * - Unified hook system
 * - add/remove single hook
 * - attach/detach class-based providers
 * - run hook chain
 */
export class InterceptorManager {
  constructor(client) {
    this.client = client;
    this.hooks = new Map(); // hookName -> [{name, cb, priority}]
    this.providers = new Map(); // providerName -> instance
  }

  add(hookName, name, callback, priority = 10) {
    const list = this.hooks.get(hookName) || [];
    list.push({name, cb: callback, priority});
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
  attach(name, Provider) {
    if (this.providers.has(name)) return this.providers.get(name);

    if (typeof Provider !== 'function') {
      throw new Error(`Invalid provider: ${name} must be a class`);
    }

    if (!(Provider.prototype instanceof BaseInterceptor)) {
      throw new Error(`Provider ${name} must extend BaseInterceptor`);
    }

    const instance = new Provider();
    instance.register(this, this.client);
    this.providers.set(name, instance);
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

  async run(hookName, value, context = {}, ...extraArgs) {
    const list = this.hooks.get(hookName) || [];
    let out = value;

    for (const item of list) {
      const result = await item.cb(out, context, ...extraArgs);
      if (typeof result !== 'undefined') {
        out = result;
      }
    }

    return out;
  }
}
