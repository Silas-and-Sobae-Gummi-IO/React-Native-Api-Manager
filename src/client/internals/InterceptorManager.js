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
    this.hooks = new Map(); // hookName -> [{name, callback, priority, _provider}]
    this.providers = new Map(); // providerName -> instance
    this._currentProvider = null; // Track which provider is currently registering
  }

  add(hookName, name, callback, priority = 10) {
    const list = this.hooks.get(hookName) || [];
    list.push({
      name,
      callback,
      priority,
      _provider: this._currentProvider, // Track which provider added this hook
    });
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
   * @param {class} Provider - must extend BaseInterceptor
   * @param {string} name - optional explicit name
   */
  attach(Provider, name = undefined) {
    if (typeof Provider !== 'function') {
      throw new Error(`Invalid provider: ${name ?? '(unnamed)'} must be a class`);
    }

    // Use explicit name, then static name property, then class name
    const providerKey = name || Provider.name;

    if (!providerKey || providerKey === '') {
      throw new Error('Anonymous providers must be attached with an explicit name.');
    }

    // Validate that provider name doesn't start with shorthand prefixes
    if (providerKey.startsWith('-') || providerKey.startsWith('+') || providerKey.startsWith('~')) {
      throw new Error(`Provider name "${providerKey}" cannot start with shorthand prefix (-, +, ~)`);
    }

    if (this.providers.has(providerKey)) {
      return this.providers.get(providerKey);
    }

    if (!(Provider.prototype instanceof BaseInterceptor)) {
      throw new Error(`Provider ${providerKey} must extend BaseInterceptor`);
    }

    // Set current provider context before init so hooks can be tracked
    this._currentProvider = providerKey;
    const instance = new Provider().init(this, this.client);
    this._currentProvider = null; // Clear after registration

    this.providers.set(providerKey, instance);
    return instance;
  }

  detach(name) {
    const instance = this.providers.get(name);
    if (!instance) return;

    // Remove all hooks registered by this provider
    for (const [hookName, list] of this.hooks.entries()) {
      this.hooks.set(
        hookName,
        list.filter((hook) => hook._provider !== name)
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

  /**
   * Process an array of interceptors, attaching classes or detaching by name.
   * Supports "-name" syntax for removal.
   * @param {Array} list - Array of interceptor classes or "-name" strings
   */
  processInterceptors(list) {
    if (!Array.isArray(list)) return;

    for (const item of list) {
      // Skip null/undefined entries
      if (item == null) continue;

      // Handle removal syntax: "-name"
      if (typeof item === 'string' && item.startsWith('-')) {
        this.detach(item.slice(1));
      }
      // Handle class attachment
      else if (typeof item === 'function') {
        this.attach(item);
      }
    }
  }
}
