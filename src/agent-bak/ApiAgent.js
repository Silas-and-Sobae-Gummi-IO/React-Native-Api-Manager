// src/agent/ApiAgent.js

import { ApiClient } from '../client/ApiClient';
import { RequestScheduler } from './internals/RequestScheduler';
import { ConditionalRetrier } from './internals/ConditionalRetrier';
import { OfflineManager } from './internals/OfflineManager'; // Import
import { ApiError } from '../client/ApiError';

class ApiAgent {
  constructor() {
    this.clients = new Map();
    this.globalConfig = {};
    this.globalInterceptors = [];
    this.scheduler = new RequestScheduler();
    this.conditionalRetriers = [];
    this.offlineManager = null; // Initialize as null
  }

  // --- NEW Public Method ---
  /**
   * Enables offline request queuing.
   * @param {object} options
   * @param {StorageAdapter} options.adapter - User-provided storage adapter.
   * @param {object} options.netInfo - Network info provider instance.
   */
  enablePersistence({ adapter, netInfo }) {
    if (this.offlineManager) {
      this.offlineManager.dispose(); // Clean up old one if exists
    }

    // The replay function needs to execute a request bypassing the queue check
    const replayRequestFn = async (serializedRequest) => {
      const { method, url, body, headers } = serializedRequest;
      // We need a way to make a raw request. Let's assume a default client exists
      // or create a temporary one? For simplicity, let's use a default client if available.
      // This might need refinement. Perhaps the replayFn is passed in? Yes, better.
      // Let's redefine. The agent needs to provide the replayFn.

      // Replay using a temporary "raw" client or specific logic?
      // Simplest: Use a default client but bypass queueing via an option.
      const client = this.getClient('default'); // Requires a client named 'default'
      if (!client)
        throw new Error("Offline replay requires a client named 'default'");

      // We need to signal the client's request method to bypass offline check
      // Add a special option for this.
      const options = { headers, _bypassOffline: true };

      // Use the standard client methods
      switch (method) {
        case 'POST':
          return client.post(url, body, options);
        case 'PUT':
          return client.put(url, body, options);
        case 'PATCH':
          return client.patch(url, body, options);
        case 'DELETE':
          return client.delete(url, options);
        default:
          throw new Error(`Unsupported method for offline replay: ${method}`);
      }
    };

    this.offlineManager = new OfflineManager(adapter, netInfo, replayRequestFn);

    // Inject a global interceptor to check for queuing
    this.addGlobalInterceptor(
      'internal-offline-handler',
      {
        onRequest: async (config) => {
          // If replay is bypassing, or offline manager doesn't want to queue, proceed
          if (
            config._bypassOffline ||
            !this.offlineManager?.shouldQueue(config.method)
          ) {
            return config;
          }

          // Otherwise, queue the request and throw a specific error to stop the chain
          await this.offlineManager.queueRequest(config);
          const queueError = new Error('Request queued offline.');
          queueError.isOfflineQueueError = true; // Flag for identification
          throw queueError;
        },
      },
      { priority: 5 }
    ); // Run early, but after scheduler inject
  }

  // ... (rest of the class remains the same) ...
  /**
   * Sets the base configuration that all newly created clients will inherit.
   * @param {object} config The global configuration object.
   */
  setGlobalConfig(config) {
    this.globalConfig = { ...this.globalConfig, ...config };
  }
  /**
   * Creates or replaces an ApiClient instance.
   * This method "decorates" the client's internal request methods to route them
   * through the agent's central scheduler and conditional retriers.
   * @param {string} name The unique name for the client.
   * @param {object} [config={}] Client-specific configuration.
   * @returns {ApiClient} The created, managed client instance.
   */
  createClient(name, config = {}) {
    const finalConfig = { ...this.globalConfig, ...config };
    const client = new ApiClient(finalConfig);

    // --- DECORATOR PATTERN for _executeAttempt ---
    const originalExecuteAttempt = client._executeAttempt.bind(client);
    client._executeAttempt = async (requestConfig) => {
      const { controller, timeoutId } = client._setupAttempt(requestConfig);
      const attemptFn = () =>
        this.scheduler.schedule(
          () =>
            originalExecuteAttempt({
              ...requestConfig,
              signal: controller.signal,
            }),
          requestConfig,
          controller
        );

      try {
        const result = await attemptFn();
        client._cleanupAttempt(requestConfig, timeoutId); // Cleanup on success path
        return result;
      } catch (error) {
        // If it's an offline queue error, just let it propagate cleanly
        if (error?.isOfflineQueueError) {
          client._cleanupAttempt(requestConfig, timeoutId); // Still need cleanup
          throw error;
        }
        // Check against conditional retriers
        for (const retrier of this.conditionalRetriers) {
          const retryPromise = retrier.handleError(
            error,
            attemptFn,
            controller
          );
          if (retryPromise) {
            // Retrier handles outcome and cleanup via its finally
            return retryPromise.finally(() => {
              client._cleanupAttempt(requestConfig, timeoutId);
            });
          }
        }
        // If no retrier handled it, run cleanup and then re-throw.
        client._cleanupAttempt(requestConfig, timeoutId);
        throw error;
      }
    };
    // --- END DECORATOR ---

    this.clients.set(name, { instance: client, config: finalConfig });

    // Apply any existing user-defined global interceptors AFTER agent interceptors
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
    this.createClient(name, mergedConfig); // Re-creation applies decorator correctly
  }
  /**
   * Adds a global interceptor and applies it to all relevant clients.
   * @param {string} name The name of the interceptor.
   * @param {object} callbacks The interceptor callback functions.
   * @param {object} [options={}] Options like priority and client scope.
   */
  addGlobalInterceptor(name, callbacks, options = {}) {
    const priority = options.priority ?? 10;
    this.globalInterceptors = this.globalInterceptors.filter(
      (i) => i.name !== name
    );
    this.globalInterceptors.push({ name, callbacks, priority, options });

    this.clients.forEach(({ instance }, clientName) => {
      const { clients } = options;
      const isScoped = clients && clients.length > 0;
      if (!isScoped || clients.includes(clientName)) {
        instance.interceptors.remove(name);
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
  // --- New Conditional Retrier Public API ---
  addRetryHandler(options) {
    const { name, shouldRetry, handler } = options;
    if (!name || !shouldRetry || !handler) {
      throw new Error(
        'addRetryHandler requires name, shouldRetry, and handler properties.'
      );
    }
    this.removeRetryHandler(name);
    const retrier = new ConditionalRetrier(shouldRetry, handler);
    retrier.name = name;
    this.conditionalRetriers.push(retrier);
  }
  removeRetryHandler(name) {
    this.conditionalRetriers = this.conditionalRetriers.filter(
      (r) => r.name !== name
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

// ... (exports remain the same) ...
const agent = new ApiAgent();
export default agent;
export { ApiAgent };
