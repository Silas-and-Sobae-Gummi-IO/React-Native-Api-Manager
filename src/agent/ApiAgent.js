// src/agent/ApiAgent.js

import { ApiClient } from '../client/ApiClient';
import { RequestScheduler } from './internals/RequestScheduler';

/**
 * The ApiAgent class acts as a central manager for all ApiClient instances.
 */
class ApiAgent {
  constructor() {
    this.clients = new Map();
    this.globalConfig = {};
    this.globalInterceptors = [];
    this.scheduler = new RequestScheduler();
  }

  /**
   * Sets the base configuration that all newly created clients will inherit.
   * @param {object} config The global configuration object.
   */
  setGlobalConfig(config) {
    this.globalConfig = { ...this.globalConfig, ...config };
  }

  /**
   * Creates or replaces an ApiClient instance.
   * This method "decorates" the client's internal request method to route it
   * through the agent's central scheduler.
   * @param {string} name The unique name for the client.
   * @param {object} [config={}] Client-specific configuration.
   * @returns {ApiClient} The created, managed client instance.
   */
  createClient(name, config = {}) {
    const finalConfig = { ...this.globalConfig, ...config };
    const client = new ApiClient(finalConfig);

    // --- DECORATOR PATTERN ---
    // 1. Store the original, internal method.
    const originalExecuteAttempt = client._executeAttempt.bind(client);

    // 2. Override the client's internal method with a new one that uses our scheduler.
    client._executeAttempt = (requestConfig) => {
      const controller =
        requestConfig.signal?.controller || new AbortController();

      // 3. The new method's only job is to delegate to the central scheduler.
      return this.scheduler.schedule(
        () => originalExecuteAttempt(requestConfig), // The action to perform
        requestConfig, // Options like 'channel' and 'scope'
        controller
      );
    };
    // --- END DECORATOR ---

    this.clients.set(name, { instance: client, config: finalConfig });

    // Apply any existing global interceptors to this new client
    this.globalInterceptors.forEach((interceptor) => {
      const { clients } = interceptor.options;
      const isScoped = clients && clients.length > 0;
      if (!isScoped || clients.includes(name)) {
        client.interceptors.add(
          interceptor.name,
          interceptor.callbacks,
          interceptor.priority
        );
      }
    });

    return client;
  }

  /**
   * Retrieves a registered client instance by name.
   * @param {string} name The name of the client to retrieve.
   * @returns {ApiClient} The client instance.
   */
  getClient(name) {
    if (!this.clients.has(name)) {
      throw new Error(`ApiAgent: No client registered with the name '${name}'`);
    }
    return this.clients.get(name).instance;
  }

  /**
   * Updates the configuration of an existing client by re-creating it.
   * @param {string} name The name of the client to update.
   * @param {object} newConfig The new configuration properties to merge in.
   */
  updateClientConfig(name, newConfig) {
    if (!this.clients.has(name)) {
      throw new Error(
        `ApiAgent: No client registered with the name '${name}' to update.`
      );
    }

    const oldConfig = this.clients.get(name).config;
    const mergedConfig = { ...oldConfig, ...newConfig };

    this.createClient(name, mergedConfig);
  }

  /**
   * Adds a global interceptor and applies it to all relevant clients.
   * @param {string} name The name of the interceptor.
   * @param {object} callbacks The interceptor callback functions.
   * @param {object} [options={}] Options like priority and client scope.
   */
  addGlobalInterceptor(name, callbacks, options = {}) {
    const priority = options.priority ?? 10;
    this.globalInterceptors.push({ name, callbacks, priority, options });

    this.clients.forEach(({ instance }, clientName) => {
      const { clients } = options;
      const isScoped = clients && clients.length > 0;
      if (!isScoped || clients.includes(clientName)) {
        instance.interceptors.add(name, callbacks, priority);
      }
    });
  }

  /**
   * Removes a global interceptor from the agent and all relevant clients.
   * @param {string} name The name of the interceptor to remove.
   */
  removeGlobalInterceptor(name) {
    const interceptorToRemove = this.globalInterceptors.find(
      (interceptor) => interceptor.name === name
    );

    if (!interceptorToRemove) return;

    const { clients } = interceptorToRemove.options;
    const isScoped = clients && clients.length > 0;

    const targetClients = isScoped
      ? clients
          .map((clientName) => this.clients.get(clientName)?.instance)
          .filter(Boolean)
      : Array.from(this.clients.values()).map((c) => c.instance);

    targetClients.forEach((client) => {
      client.interceptors.remove(name);
    });

    this.globalInterceptors = this.globalInterceptors.filter(
      (interceptor) => interceptor.name !== name
    );
  }

  // --- New Scheduler Public API ---
  configureChannels(channelConfig) {
    this.scheduler.configureChannels(channelConfig);
  }

  pauseChannel(channelName) {
    this.scheduler.pauseChannel(channelName);
  }

  resumeChannel(channelName) {
    this.scheduler.resumeChannel(channelName);
  }

  abortScope(scopeName) {
    this.scheduler.abortScope(scopeName);
  }
}

/**
 * A pre-instantiated, singleton instance of the ApiAgent for easy app-wide use.
 */
const agent = new ApiAgent();

// Default export for the singleton instance
export default agent;

// Named export for the class itself for testing or advanced use.
export { ApiAgent };
