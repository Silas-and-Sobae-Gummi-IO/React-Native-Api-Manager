/**
 * Hooks manager (WordPress-like): actions + filters with per-hook priorities.
 * - Filters transform a value via applyFilters(name, value, context)
 * - Actions observe side effects via doAction(name, payload, context)
 */
export class InterceptorManager {
  constructor(client) {
    this.client = client;
    this.filters = new Map(); // name -> [{name, cb, priority}]
    this.actions = new Map(); // name -> [{name, cb, priority}]
    this.registered = new Map(); // interceptorName -> instance
  }

  // Filters
  addFilter(hookName, name, callback, priority = 10) {
    const list = this.filters.get(hookName) || [];
    list.push({ name, cb: callback, priority });
    list.sort((a, b) => a.priority - b.priority);
    this.filters.set(hookName, list);
  }

  removeFilter(hookName, name) {
    const list = this.filters.get(hookName) || [];
    this.filters.set(
      hookName,
      list.filter((i) => i.name !== name)
    );
  }

  async applyFilters(hookName, value, context) {
    const list = this.filters.get(hookName) || [];
    let out = value;
    for (const item of list) {
      const next = await item.cb(out, context);
      out = next === undefined ? out : next;
    }
    return out;
  }

  // Actions
  addAction(hookName, name, callback, priority = 10) {
    const list = this.actions.get(hookName) || [];
    list.push({ name, cb: callback, priority });
    list.sort((a, b) => a.priority - b.priority);
    this.actions.set(hookName, list);
  }

  removeAction(hookName, name) {
    const list = this.actions.get(hookName) || [];
    this.actions.set(
      hookName,
      list.filter((i) => i.name !== name)
    );
  }

  async doAction(hookName, payload, context) {
    const list = this.actions.get(hookName) || [];
    for (const item of list) {
      await item.cb(payload, context);
    }
  }

  // Register an interceptor class which exposes register(hooks, client)
  add(name, Interceptor) {
    if (this.registered.has(name)) return this.registered.get(name);

    let instance;
    if (typeof Interceptor === 'function') {
      // class-style
      instance = new Interceptor();
      if (typeof instance.register === 'function') instance.register(this, this.client);
    } else if (Interceptor && typeof Interceptor === 'object') {
      // object-style: { filters?: {hook: fn}, actions?: {hook: fn} }
      instance = Interceptor;
      const { filters = {}, actions = {} } = Interceptor;
      for (const [hook, fn] of Object.entries(filters)) {
        this.addFilter(hook, `${name}:filter:${hook}`, fn, 10);
      }
      for (const [hook, fn] of Object.entries(actions)) {
        this.addAction(hook, `${name}:action:${hook}`, fn, 10);
      }
    } else {
      throw new Error('Invalid interceptor provided');
    }

    this.registered.set(name, instance);
    return instance;
  }
}
