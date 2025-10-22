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

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Add a hook (WordPress-style signature)
   * @param {string} hookName - The hook to attach to
   * @param {function} callback - The callback function
   * @param {number} priority - Execution priority (lower = earlier)
   * @param {string|null} name - Optional unique name (auto-generated if null)
   * @returns {string} The hook name (generated or provided)
   */
  add(hookName, callback, priority = 10, name = null) {
    this._validateCallback(hookName, callback);
    const hookId = this._resolveHookName(hookName, callback, name);

    const list = this.hooks.get(hookName) || [];

    // Replace existing hook with same name
    const existingIndex = list.findIndex((h) => h.name === hookId);
    if (existingIndex !== -1) {
      console.warn(`Hook "${hookId}" already exists on "${hookName}". Replacing it.`);
      list.splice(existingIndex, 1);
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
    const providerKey = this._resolveProviderName(Provider, name);

    // Return existing instance if already attached
    if (this.providers.has(providerKey)) {
      return this.providers.get(providerKey);
    }

    this._validateProvider(Provider, providerKey);

    // Initialize provider with tracking context
    const instance = this._initializeProvider(Provider, providerKey);

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

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Validate that callback is a function
   * @private
   */
  _validateCallback(hookName, callback) {
    if (typeof callback !== 'function') {
      throw new Error(`Callback must be a function for hook "${hookName}"`);
    }
  }

  /**
   * Resolve hook name - validate explicit name or auto-generate
   * @private
   */
  _resolveHookName(hookName, callback, name) {
    // Explicit name provided - validate it
    if (name !== null && name !== undefined) {
      if (typeof name !== 'string' || name === '') {
        throw new Error(`Hook name must be a non-empty string for hook "${hookName}"`);
      }
      return name;
    }

    // Auto-generate name
    return this._generateHookName(callback);
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
   * Resolve provider name from class or explicit name
   * @private
   */
  _resolveProviderName(Provider, name) {
    const providerKey = name || Provider.name;

    if (!providerKey || providerKey === '') {
      throw new Error('Anonymous providers must be attached with an explicit name.');
    }

    if (providerKey.startsWith('-') || providerKey.startsWith('+') || providerKey.startsWith('~')) {
      throw new Error(`Provider name "${providerKey}" cannot start with shorthand prefix (-, +, ~)`);
    }

    return providerKey;
  }

  /**
   * Validate that provider is a valid class extending BaseInterceptor
   * @private
   */
  _validateProvider(Provider, providerKey) {
    console.log('DEBUG', Provider);
    if (typeof Provider !== 'function') {
      throw new Error(`Invalid provider: ${providerKey} must be a class`);
    }

    if (!(Provider.prototype instanceof BaseInterceptor)) {
      throw new Error(`Provider ${providerKey} must extend BaseInterceptor`);
    }
  }

  /**
   * Initialize provider instance with tracking context
   * @private
   */
  _initializeProvider(Provider, providerKey) {
    this._currentProvider = providerKey;

    try {
      return new Provider().init(this, this.client);
    } finally {
      this._currentProvider = null;
    }
  }
}
