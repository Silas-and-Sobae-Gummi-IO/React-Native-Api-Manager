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
    this._nextAutoId = 0; // Counter for auto-generated hook names
  }

  /**
   * Add a hook (WordPress-style signature)
   * @param {string} hookName - The hook to attach to
   * @param {function} callback - The callback function
   * @param {number} priority - Execution priority (lower = earlier)
   * @param {string|null} name - Optional unique name (auto-generated if null)
   * @returns {string} The hook name (generated or provided)
   */
  add(hookName, callback, priority = 10, name = null) {
    // Validate callback
    if (typeof callback !== 'function') {
      throw new Error(`Callback must be a function for hook "${hookName}"`);
    }

    // Generate name if not provided
    const hookId = name || this._generateHookName(callback);

    // Validate name
    if (typeof hookId !== 'string' || hookId === '') {
      throw new Error(`Hook name must be a non-empty string for hook "${hookName}"`);
    }

    const list = this.hooks.get(hookName) || [];

    // Check for duplicate names
    const existing = list.find((h) => h.name === hookId);
    if (existing) {
      console.warn(`Hook "${hookId}" already exists on "${hookName}". Replacing it.`);
      this.remove(hookName, hookId);
    }

    list.push({
      name: hookId,
      callback,
      priority,
      _provider: this._currentProvider,
    });

    list.sort((a, b) => a.priority - b.priority);
    this.hooks.set(hookName, list);

    return hookId;
  }

  /**
   * Generate a unique name for a hook
   * @private
   */
  _generateHookName(callback) {
    const baseName = callback.name || 'anonymous';
    return `${baseName}_${this._nextAutoId++}`;
  }

  /**
   * Remove a hook by name
   * @param {string} hookName - The hook to remove from
   * @param {string} name - The unique name of the hook to remove
   */
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

    let instance;
    try {
      instance = new Provider().init(this, this.client);
    } finally {
      this._currentProvider = null; // Clear even if init throws
    }

    this.providers.set(providerKey, instance);
    return instance;
  }

  /**
   * Detach a provider and remove all its hooks
   * @param {string} name - The provider name
   */
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

  /**
   * Run a hook chain
   * @param {string} hookName - The hook to run
   * @param {*} value - Initial value to pass through the chain
   * @param {object} context - Additional context for callbacks
   * @returns {*} The final value after all callbacks
   */
  async run(hookName, value = undefined, context = {}) {
    const list = this.hooks.get(hookName) || [];
    let out = value;

    for (const item of list) {
      try {
        const result = await (typeof out === 'undefined' ? item.callback(context) : item.callback(out, context));

        if (typeof result !== 'undefined') {
          out = result;
        }
      } catch (error) {
        console.error(`Error in hook "${item.name}" on "${hookName}":`, error);
        // Continue with next hook
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
