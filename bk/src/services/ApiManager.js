import { createApiClient } from '../libraries/ApiClient';

/**
 * Creates and manages a singleton registry of ApiClient instances.
 * Provides centralized API client management with default client support and proxy methods.
 * 
 * @returns {Object} The manager instance with register, use, and proxy methods
 */
const createApiManager = () => {
  const registeredClients = new Map();
  let defaultClientName = null;

  const apiManager = {
    /**
     * Registers a new, named ApiClient instance.
     * 
     * @param {string} name - The unique name for this client
     * @param {Object} config - The configuration object for createApiClient
     * @param {boolean} [isDefault=false] - If true, sets this client as the default
     * @returns {Object} The newly created ApiClient instance
     * @throws {Error} If name is already registered or a default already exists
     */
    register: (name, config, isDefault = false) => {
      if (!name || typeof name !== 'string') {
        throw new Error('API client name must be a non-empty string');
      }
      
      if (registeredClients.has(name)) {
        throw new Error(`An API client named '${name}' is already registered`);
      }
      
      if (isDefault && defaultClientName) {
        throw new Error(
          `A default API client ('${defaultClientName}') is already registered. ` +
          `Cannot set '${name}' as a second default`
        );
      }

      const apiClient = createApiClient(config);
      registeredClients.set(name, apiClient);

      if (isDefault) {
        defaultClientName = name;
      }

      return apiClient;
    },

    /**
     * Retrieves a registered ApiClient instance by name.
     * 
     * @param {string} [name] - The name of the client to retrieve. If omitted, returns the default client
     * @returns {Object} The ApiClient instance
     * @throws {Error} If no name provided and no default set, or if named client doesn't exist
     */
    use: (name) => {
      const clientName = name || defaultClientName;

      if (!clientName) {
        throw new Error(
          'manager.use() was called without a name, but no default client has been registered'
        );
      }

      const apiClient = registeredClients.get(clientName);

      if (!apiClient) {
        throw new Error(`No API client named '${clientName}' has been registered`);
      }

      return apiClient;
    },

    /**
     * Checks if a client with the given name has been registered.
     * 
     * @param {string} name - The name of the client to check
     * @returns {boolean} True if the client is registered, false otherwise
     */
    isRegistered: (name) => {
      return registeredClients.has(name);
    },

    /**
     * Gets the name of the default client, if one is set.
     * 
     * @returns {string|null} The default client name or null if none set
     */
    getDefaultClientName: () => defaultClientName,

    /**
     * Gets a list of all registered client names.
     * 
     * @returns {string[]} Array of registered client names
     */
    getRegisteredClientNames: () => Array.from(registeredClients.keys()),
  };

  // Dynamically create proxy methods by inspecting a template client
  const templateClient = createApiClient({ baseUrl: '' });
  const clientMethods = ['request', 'get', 'post', 'put', 'del', 'upload', 'all', 'abort', 'setHeader', 'unsetHeader', 'clearHeaders'];

  clientMethods.forEach(methodName => {
    if (typeof templateClient[methodName] === 'function') {
      /**
       * Proxy method that forwards calls to the default client.
       * Throws an error if no default client is registered.
       */
      apiManager[methodName] = (...args) => {
        const defaultClient = apiManager.use(); // Throws if no default is set
        return defaultClient[methodName](...args);
      };
    }
  });

  return apiManager;
};

/**
 * The singleton instance of the ApiManager.
 * This is the main export that should be used throughout the application.
 */
export const manager = createApiManager();

/**
 * Export the factory function for testing purposes.
 */
export { createApiManager };
