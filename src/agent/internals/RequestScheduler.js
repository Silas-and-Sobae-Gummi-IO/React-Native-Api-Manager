// src/agent/internals/RequestScheduler.js

/**
 * Manages request queues, concurrency, pausing, and cancellation scopes.
 * This class is the internal engine for the ApiAgent's advanced scheduling features.
 */
export class RequestScheduler {
  constructor() {
    // Stores channel config { concurrency, paused }
    this.channels = new Map();
    // Stores queues of pending tasks { requestFn, resolve, reject, controller, scope, priority }
    this.queues = new Map();
    // Stores sets of currently active tasks for each channel
    this.activeRequests = new Map();
    // Stores scopeName -> Set<AbortController> for cancellation
    this.scopes = new Map();
    // Ensure a default channel exists
    this._ensureChannel('default', { concurrency: Infinity });
  }

  /**
   * Ensures a channel exists with default settings if not configured.
   * @param {string} name
   * @param {object} [defaults={ concurrency: Infinity }]
   * @private
   */
  _ensureChannel(name, defaults = { concurrency: Infinity }) {
    if (!this.channels.has(name)) {
      this.channels.set(name, { ...defaults, paused: false });
      this.queues.set(name, []);
      this.activeRequests.set(name, new Set());
    }
  }

  /**
   * Defines or updates the channels and their concurrency limits.
   * @param {object} channelConfig - E.g., { interactive: { concurrency: 6 }, background: { concurrency: 2 } }
   */
  configureChannels(channelConfig) {
    for (const [name, config] of Object.entries(channelConfig)) {
      this._ensureChannel(name); // Ensure maps exist
      const existingConfig = this.channels.get(name);
      this.channels.set(name, { ...existingConfig, ...config }); // Merge new config
    }
  }

  /**
   * Pauses a channel, preventing new requests from being processed.
   * @param {string} channelName The name of the channel to pause.
   */
  pauseChannel(channelName) {
    this._ensureChannel(channelName);
    this.channels.get(channelName).paused = true;
  }

  /**
   * Resumes a paused channel and processes its queue.
   * @param {string} channelName The name of the channel to resume.
   */
  resumeChannel(channelName) {
    this._ensureChannel(channelName);
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
      // Create a copy before iterating as aborting might modify the set
      const controllersToAbort = new Set(this.scopes.get(scopeName));
      controllersToAbort.forEach((controller) => controller.abort());
      // No need to delete here, _processQueue's finally block handles cleanup
    }
  }

  /**
   * The main entry point for scheduling a request.
   * It decides whether to run a request immediately or queue it.
   * @param {Function} requestFn - The async function that executes the request (e.g., client._performFetch).
   * @param {object} options - Options including 'channel', 'scope', and 'priority'.
   * @param {AbortController} controller - The AbortController for this request.
   * @returns {Promise<any>} A promise that resolves/rejects when the request completes or is aborted.
   */
  schedule(requestFn, options, controller) {
    const { channel = 'default', scope, priority = 0 } = options;
    this._ensureChannel(channel); // Make sure the channel exists

    // If a scope is provided, register the controller
    if (scope) {
      if (!this.scopes.has(scope)) this.scopes.set(scope, new Set());
      this.scopes.get(scope).add(controller);
    }

    // Return a new promise that wraps the entire scheduling and execution lifecycle
    return new Promise((resolve, reject) => {
      const task = { requestFn, resolve, reject, controller, scope, priority };

      // Add to queue and sort by priority (lower number = higher priority)
      const queue = this.queues.get(channel);
      queue.push(task);
      queue.sort((a, b) => a.priority - b.priority);

      // Listen for external aborts (e.g., from cancelKey or timeout)
      controller.signal.addEventListener(
        'abort',
        () => {
          // If aborted before even starting, remove from queue and reject
          const index = queue.indexOf(task);
          if (index > -1) {
            queue.splice(index, 1);
          }
          // If aborted *while* active or waiting, the finally block in _processQueue handles cleanup.
          // We still reject the main promise here.
          reject(controller.signal.reason || new Error('Request aborted'));
        },
        { once: true }
      ); // Important: listen only once

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

    // Stop if channel doesn't exist, is paused, queue is empty, or signal is aborted (handled by listener)
    if (!channel || channel.paused || queue.length === 0) {
      return;
    }

    // Process tasks while there are open slots and items in the queue
    while (active.size < channel.concurrency && queue.length > 0) {
      const task = queue.shift();

      // Double-check if the task was aborted *just* before being picked
      if (task.controller.signal.aborted) {
        // Reject its promise (if not already rejected by the listener)
        task.reject(
          task.controller.signal.reason || new Error('Request aborted')
        );
        continue; // Skip to the next task in the queue
      }

      active.add(task);

      // Execute the actual request function
      task
        .requestFn()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          // Cleanup after the task finishes (success, fail, or abort)
          active.delete(task);
          if (task.scope && this.scopes.has(task.scope)) {
            this.scopes.get(task.scope).delete(task.controller);
            if (this.scopes.get(task.scope).size === 0) {
              this.scopes.delete(task.scope); // Clean up empty scope sets
            }
          }
          // Check the queue again immediately in case new slots have opened up
          this._processQueue(channelName);
        });
    }
  }
}
