// src/agent/internals/ConditionalRetrier.js

/**
 * Manages a generic retry process for requests that fail specific conditions.
 * Includes pausing subsequent requests, running a handler, and retrying/failing paused requests.
 */
export class ConditionalRetrier {
  constructor(shouldRetry, handler) {
    if (typeof shouldRetry !== 'function' || typeof handler !== 'function') {
      throw new Error(
        'ConditionalRetrier requires shouldRetry and handler functions.'
      );
    }
    this.shouldRetry = shouldRetry;
    this.handler = handler;
    this.isRunning = false;
    this.handlerPromise = null;
    this.pausedRequests = [];
  }

  handleError(error, retryOriginalRequest, controller) {
    if (!this.shouldRetry(error)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      this.pausedRequests.push({
        retryFn: retryOriginalRequest,
        resolve,
        reject,
        controller,
      });

      if (!this.isRunning) {
        this.isRunning = true;
        const currentHandlerPromise = this._runHandler(error);
        this.handlerPromise = currentHandlerPromise;

        currentHandlerPromise
          .catch(() => {}) // Prevent unhandled rejection locally
          .finally(() => {
            this.isRunning = false;
            // Pass the original promise to ensure correct resolution/rejection
            this._processPausedRequests(error, currentHandlerPromise);
            this.handlerPromise = null; // Clear after processing
          });
      }
    });
  }

  async _runHandler(triggerError) {
    try {
      await this.handler(triggerError);
      console.log('[ConditionalRetrier] Handler successful.');
      return true; // Indicate success (though value isn't strictly used)
    } catch (handlerError) {
      console.error('[ConditionalRetrier] Handler failed:', handlerError);
      throw handlerError; // Re-throw to signal failure
    }
  }

  _processPausedRequests(originalError, handlerRunPromise) {
    const requestsToProcess = [...this.pausedRequests];
    this.pausedRequests = [];

    handlerRunPromise
      .then(() => {
        // Handler succeeded
        requestsToProcess.forEach(({ retryFn, resolve, reject }) => {
          // Add safety catch here in case retryFn itself throws synchronously
          try {
            retryFn().then(resolve).catch(reject);
          } catch (syncError) {
            reject(syncError);
          }
        });
      })
      .catch((handlerError) => {
        // Handler failed
        requestsToProcess.forEach(({ reject }) => {
          reject(
            handlerError ||
              originalError ||
              new Error('Conditional handler failed')
          );
        });
      });
  }
}
