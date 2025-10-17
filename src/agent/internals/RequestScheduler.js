// src/agent/internals/RequestScheduler.js

/**
 * Manages request queues, concurrency, pausing, and cancellation scopes.
 * This class is the internal engine for the ApiAgent's advanced scheduling features.
 */
export class RequestScheduler {
  constructor() {
    this.channels = new Map();
    this.queues = new Map();
    this.activeRequests = new Map();
    this.scopes = new Map();
  }

  /**
   * Defines the channels and their concurrency limits.
   * @param {object} channelConfig - E.g., { interactive: { concurrency: 6 }, background: { concurrency: 2 } }
   */
  configureChannels(channelConfig) {
    for (const [name, config] of Object.entries(channelConfig)) {
      this.channels.set(name, { ...config, paused: false });
      this.queues.set(name, []);
      this.activeRequests.set(name, new Set());
    }
  }

  /**
   * Pauses a channel, preventing new requests from being processed.
   * @param {string} channelName The name of the channel to pause.
   */
  pauseChannel(channelName) {
    if (this.channels.has(channelName)) {
      this.channels.get(channelName).paused = true;
    }
  }

  /**
   * Resumes a paused channel and processes its queue.
   * @param {string} channelName The name of the channel to resume.
   */
  resumeChannel(channelName) {
    if (this.channels.has(channelName)) {
      this.channels.get(channelName).paused = false;
      this._processQueue(channelName);
    }
  }

  /**
   * Aborts all in-flight requests belonging to a specific scope.
   * @param {string|symbol} scopeName The name of the scope to abort.
   */
  abortScope(scopeName) {
    if (this.scopes.has(scopeName)) {
      this.scopes.get(scopeName).forEach((controller) => controller.abort());
      this.scopes.delete(scopeName); // Clean up the scope after aborting
    }
  }

  /**
   * The main entry point for scheduling a request.
   * It decides whether to run a request immediately or queue it.
   * @param {Function} requestFn - The async function that executes the request.
   * @param {object} options - Options including 'channel' and 'scope'.
   * @param {AbortController} controller - The AbortController for this request.
   * @returns {Promise<any>} A promise that resolves when the request is complete.
   */
  schedule(requestFn, options, controller) {
    const { channel = 'default', scope } = options;

    // If a scope is provided, register the controller
    if (scope) {
      if (!this.scopes.has(scope)) this.scopes.set(scope, new Set());
      this.scopes.get(scope).add(controller);
    }

    // Return a new promise that wraps the entire scheduling and execution lifecycle
    return new Promise((resolve, reject) => {
      const task = { requestFn, resolve, reject, controller, scope };

      this.queues.get(channel).push(task);
      this._processQueue(channel);
    });
  }

  /**
   * The core logic engine. Checks a channel's queue and runs tasks if slots are available.
   * @private
   */
  _processQueue(channelName) {
    const channel = this.channels.get(channelName);
    const queue = this.queues.get(channelName);
    const active = this.activeRequests.get(channelName);

    if (!channel || channel.paused || queue.length === 0) {
      return;
    }

    while (active.size < channel.concurrency && queue.length > 0) {
      const task = queue.shift();
      active.add(task);

      task
        .requestFn()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          // When the request is done, remove it from active set and from its scope
          active.delete(task);
          if (task.scope && this.scopes.has(task.scope)) {
            this.scopes.get(task.scope).delete(task.controller);
          }
          // Check the queue again in case new slots have opened up
          this._processQueue(channelName);
        });
    }
  }
}
