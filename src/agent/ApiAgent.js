import {ApiClient} from '../client/ApiClient';

/**
 * ApiAgent - Central manager for multiple ApiClient instances
 * 
 * Usage:
 *   const agent = new ApiAgent({
 *     timeout: 5000,
 *     headers: { 'x-app-name': 'my-app' },
 *     interceptors: [AuthInterceptor, LoggingInterceptor],
 *     hooks: { ... }
 *   });
 *   
 *   // Create clients (config is deep merged)
 *   agent.createClient('api', {
 *     baseURL: 'https://api.example.com',
 *     headers: { 'x-api-version': '1.0' },
 *     interceptors: [CustomInterceptor]
 *   });
 *   
 *   // Get and use clients
 *   const api = agent.getClient('api');
 *   await api.get('/users').send();
 */
export class ApiAgent {
  constructor(config = {}) {
    this.clients = new Map(); // name -> { instance, config }
    this.config = config; // Store agent's config
  }

  /**
   * Create or recreate a named ApiClient instance.
   * Deep merges agent config with client-specific config.
   * 
   * @param {string} name - Unique identifier for this client
   * @param {object} config - Client-specific configuration
   * @returns {ApiClient} The created client instance
   * 
   * @example
   *   const api = agent.createClient('api', {
   *     baseURL: 'https://api.example.com',
   *     headers: { 'x-api-version': '1.0' }
   *   });
   */
  createClient(name, config = {}) {
    // Deep merge agent config with client config
    const finalConfig = this._deepMerge(this.config, config);

    // Create the client
    const client = new ApiClient(finalConfig);

    // Store client reference
    this.clients.set(name, {instance: client, config: finalConfig});

    return client;
  }

  /**
   * Get a client instance by name.
   * 
   * @param {string} name - Name of the client to retrieve
   * @returns {ApiClient} The client instance
   * @throws {Error} If client doesn't exist
   * 
   * @example
   *   const api = agent.getClient('api');
   *   await api.get('/users').send();
   */
  getClient(name) {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`ApiAgent: No client found with name "${name}"`);
    }
    return client.instance;
  }

  /**
   * Check if a client exists.
   * 
   * @param {string} name - Name of the client to check
   * @returns {boolean} True if client exists
   */
  hasClient(name) {
    return this.clients.has(name);
  }


  /**
   * Get list of all registered client names.
   * 
   * @returns {string[]} Array of client names
   */
  getClientNames() {
    return Array.from(this.clients.keys());
  }

  /**
   * Remove a client from the agent.
   * 
   * @param {string} name - Name of the client to remove
   * @returns {boolean} True if client was removed, false if didn't exist
   */
  removeClient(name) {
    return this.clients.delete(name);
  }

  /**
   * Deep merge two config objects.
   * Arrays are concatenated (e.g., interceptors, hooks).
   * Objects are merged recursively (e.g., headers).
   * 
   * @private
   */
  _deepMerge(target, source) {
    const result = {...target};

    for (const key in source) {
      if (source[key] === undefined) continue;

      // Special handling for arrays (interceptors, etc.) - concatenate
      if (Array.isArray(source[key])) {
        result[key] = [
          ...(Array.isArray(result[key]) ? result[key] : []),
          ...source[key]
        ];
      }
      // Special handling for nested objects (headers, hooks, etc.) - merge
      else if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = {
          ...(result[key] || {}),
          ...source[key]
        };
      }
      // Primitives - source overwrites
      else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

// Export class only (no singleton - user creates their own instance)
export default ApiAgent;
