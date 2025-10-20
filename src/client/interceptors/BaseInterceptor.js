/**
 * BaseInterceptor
 * - All interceptors must extend this.
 * - Provides helpers for standardized config patterns
 */
export class BaseInterceptor {
  static name = 'base';
  static defaultConfig = null;
  
  // Child classes should set this explicitly
  configKey = null;

  init(manager, client) {
    this._manager = manager;
    this._client = client;

    this.register();
    return this;
  }

  register() {
    throw new Error('Interceptor must implement register(hooks, client)');
  }

  /**
   * Auto-register hooks for boolean shorthand config pattern
   * Usage: this._useShorthandConfig()
   * Reads configKey from: this.configKey or falls back to class name
   */
  _useShorthandConfig() {
    const key = this.configKey || this.constructor.name.replace('Interceptor', '').toLowerCase();
    const name = this.constructor.name.toLowerCase().replace('interceptor', '');
    
    this._manager.add('request:defaultConfig', `${name}:defaults`, (config) => ({...config, [key]: this._getDefaultConfig()}), 10);
    this._manager.add('request:clientConfig', `${name}:normalizeClient`, (config) => this._normalizeConfig(config, key), 10);
    this._manager.add('request:requestConfig', `${name}:normalizeRequest`, (config) => this._normalizeConfig(config, key), 10);
  }

  /**
   * Get default config for this interceptor
   * Child can override static defaultConfig or this method
   */
  _getDefaultConfig() {
    return this.constructor.defaultConfig || {};
  }

  /**
   * Normalize config value (handles boolean shorthand)
   * Only normalizes if the key exists - defaults are added by defaultConfig hook
   */
  _normalizeConfig(config, key) {
    const value = config[key];
    const defaults = this._getDefaultConfig();
    
    // Not present - skip (defaults already added by defaultConfig hook)
    if (value === undefined) {
      return config;
    }
    
    // Boolean shorthand: cache: true → cache: {enable: true, ...defaults}
    if (typeof value === 'boolean') {
      config[key] = {...defaults, enable: value};
      return config;
    }
    
    // Object - merge with defaults
    if (typeof value === 'object' && value !== null) {
      config[key] = {...defaults, ...value};
      return config;
    }
    
    return config;
  }
}
