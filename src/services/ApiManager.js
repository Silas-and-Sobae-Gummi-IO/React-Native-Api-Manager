import {createApiClient} from '../libraries/ApiClient';

/**
 * Creates and manages a singleton registry of ApiClient instances.
 * @returns {object} The manager instance with register, use, and proxy methods.
 */
const createApiManager = () => {
  const _clients = new Map();
  let _defaultClientName = null;

  const manager = {
    /**
     * Registers a new, named ApiClient instance.
     * @param {string} name - The unique name for this client.
     * @param {object} config - The configuration object for createApiClient.
     * @param {boolean} [isDefault=false] - If true, sets this client as the default.
     * @returns {object} The newly created ApiClient instance.
     */
    register: (name, config, isDefault = false) => {
      if (_clients.has(name)) {
        throw new Error(`An API client named '${name}' is already registered.`);
      }
      if (isDefault && _defaultClientName) {
        throw new Error(`A default API client ('${_defaultClientName}') is already registered. Cannot set '${name}' as a second default.`);
      }

      const client = createApiClient(config);
      _clients.set(name, client);

      if (isDefault) {
        _defaultClientName = name;
      }

      return client;
    },

    /**
     * Retrieves a registered ApiClient instance by name.
     * @param {string} [name] - The name of the client to retrieve. If omitted, returns the default client.
     * @returns {object} The ApiClient instance.
     */
    use: name => {
      const clientName = name || _defaultClientName;

      if (!clientName) {
        throw new Error(`manager.use() was called without a name, but no default client has been registered.`);
      }

      const client = _clients.get(clientName);

      if (!client) {
        throw new Error(`No API client named '${clientName}' has been registered.`);
      }

      return client;
    },

    /**
     * Checks if a client with the given name has been registered.
     * @param {string} name - The name of the client to check.
     * @returns {boolean}
     */
    isRegistered: name => {
      return _clients.has(name);
    },
  };

  // Dynamically create proxy methods by inspecting a template client.
  const templateClient = createApiClient({baseUrl: ''});

  for (const methodName in templateClient) {
    if (typeof templateClient[methodName] === 'function') {
      manager[methodName] = (...args) => {
        const defaultClient = manager.use(); // Throws if no default is set
        return defaultClient[methodName](...args);
      };
    }
  }

  return manager;
};

/**
 * The singleton instance of the ApiManager.
 */
export const manager = createApiManager();
