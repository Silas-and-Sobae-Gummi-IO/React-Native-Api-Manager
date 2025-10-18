/**
 * Manages and executes interceptors for API requests and responses.
 * Follows a pipeline pattern where data is passed through each interceptor.
 */
export class InterceptorManager {
  constructor() {
    this.interceptors = [];
  }

  /**
   * Adds an interceptor to the manager.
   * The interceptors array is kept sorted by priority.
   * @param {string} name A unique name for the interceptor.
   * @param {{onRequest?: Function, onSuccess?: Function, onError?: Function}} callbacks An object with interceptor functions.
   * @param {number} priority The execution priority (lower numbers run first).
   */
  add(name, callbacks, priority) {
    this.interceptors.push({ name, callbacks, priority });
    // Keep the array sorted by priority for efficient execution
    this.interceptors.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Removes an interceptor by its name.
   * @param {string} name The name of the interceptor to remove.
   */
  remove(name) {
    this.interceptors = this.interceptors.filter(
      (interceptor) => interceptor.name !== name
    );
  }

  /**
   * Asynchronously runs all registered interceptors for a given hook.
   * @param {string} hookName The name of the hook to run (e.g., 'onRequest', 'onSuccess').
   * @param {any} initialValue The initial data to pass to the first interceptor.
   * @returns {Promise<any>} A promise that resolves with the final data after all interceptors have run.
   */
  async run(hookName, initialValue) {
    // Run through interceptors in priority order, passing the value along.
    // If an interceptor returns undefined, we keep the previous value to avoid
    // accidentally clobbering the pipeline value (especially for onError).
    let currentValue = initialValue;

    for (const interceptor of this.interceptors) {
      const fn = interceptor?.callbacks?.[hookName];
      if (typeof fn !== 'function') continue;

      // Await the result and preserve previous value when a handler returns undefined
      // to support "tap" style interceptors.
      const next = await fn(currentValue);
      currentValue = next === undefined ? currentValue : next;
    }

    return currentValue;
  }
}
