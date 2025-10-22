import {BaseInterceptor} from './BaseInterceptor';

/**
 * RecoveryInterceptor
 * 
 * Handles error recovery by running custom handlers before retrying.
 * Perfect for auth refresh, device registration, etc.
 * 
 * Config (object with named handlers):
 *   recovery: {
 *     auth: {
 *       enable: true,  // Can disable per-request: {auth: {enable: false}}
 *       shouldRetry: (error, context) => error.status === 401,
 *       handler: async (error, context) => { await refreshToken(); },
 *       abortOnFailure: true  // Fail paused requests if handler fails (default: true)
 *     },
 *     device: {
 *       enable: true,
 *       shouldRetry: (error, context) => error.status === 403,
 *       handler: async (error, context) => { await registerDevice(); }
 *     }
 *   }
 * 
 * Flow:
 *   1. Request fails with error
 *   2. Check all enabled handlers to find match (shouldRetry returns true)
 *   3. Pause subsequent requests for this client
 *   4. Run handler
 *   5. If handler succeeds → retry original request
 *   6. If handler fails → throw original error
 *   7. Resume paused requests
 */
export class RecoveryInterceptor extends BaseInterceptor {
  static name = 'recovery';
  
  configKey = 'recovery';

  constructor() {
    super();
    this.runningHandlers = new Map(); // name -> promise
    this.pausedRequests = []; // Queue of {resolve, reject}
  }

  register() {
    // Store request reference in context (we need it later for retry)
    this._manager.add('request:init', this._storeRequest.bind(this), 1, 'recovery:storeRequest');
    
    // Handle errors and attempt recovery
    this._manager.add('request:formatError', this._handleError.bind(this), 40, 'recovery:handle');
    
    // Check if recovery is in progress before request
    this._manager.add('request:beforeRequest', this._checkPause.bind(this), 40, 'recovery:checkPause');
  }

  /**
   * Store request reference in context for later use
   */
  _storeRequest(context) {
    // Store request in instance-level context (persists across hooks)
    context.context._request = context.request;
  }

  /**
   * Check if any recovery is in progress and pause request if needed
   */
  async _checkPause(context) {
    const handlers = this._getHandlers(context.config);
    if (!handlers || Object.keys(handlers).length === 0) return;

    // If any handler is currently running, pause once
    const anyRunning = Object.keys(handlers).some(name => this.runningHandlers.has(name));
    if (anyRunning) {
      await new Promise((resolve, reject) => {
        this.pausedRequests.push({resolve, reject});
      });
    }
  }

  /**
   * Handle error and attempt recovery
   */
  async _handleError(error, context) {
    // Never attempt recovery for abort errors
    if (error.name === 'AbortError' || error.message === 'Aborted') {
      return error;
    }
    
    const handlers = this._getHandlers(context.config);
    if (!handlers || Object.keys(handlers).length === 0) {
      return error; // No handlers configured, pass error through
    }

    // Check if this request already attempted recovery (prevent infinite loops)
    // Use instance-level context flag (persists across send() calls)
    if (context.context._recoveryAttempted) {
      return error; // Already attempted, pass error through
    }

    // Find matching handler (iterate over object keys)
    for (const [name, handlerConfig] of Object.entries(handlers)) {
      // Skip if disabled
      if (handlerConfig.enable === false) continue;
      
      if (handlerConfig.shouldRetry && handlerConfig.shouldRetry(error, context)) {
        return await this._runRecovery(name, handlerConfig, error, context);
      }
    }

    // No handler matched - pass error through to next interceptor
    return error;
  }

  /**
   * Run recovery handler and retry request
   */
  async _runRecovery(name, handlerConfig, error, context) {
    const {handler, abortOnFailure = true} = handlerConfig;

    // Mark this request as attempted (prevents infinite loops)
    context.context._recoveryAttempted = true;

    // Check if this handler is already running
    if (this.runningHandlers.has(name)) {
      // Wait for existing handler to complete
      try {
        await this.runningHandlers.get(name);
      } catch (handlerError) {
        return error; // Handler failed, pass original error through
      }
      
      // Handler succeeded, retry request
      return await this._retryRequest(context);
    }

    // Start new handler
    const handlerPromise = this._executeHandler(handler, error, context, name);
    this.runningHandlers.set(name, handlerPromise);

    try {
      await handlerPromise;
      // Handler succeeded: mark not running and resume queued requests BEFORE retry
      this.runningHandlers.delete(name);
      this._resumePausedRequests();
      
      // Retry original request
      return await this._retryRequest(context);
    } catch (handlerError) {
      // Handler failed
      console.error(`[RecoveryInterceptor] Handler \"${name}\" failed:`, handlerError);
      
      // Mark not running and resolve queued requests appropriately
      this.runningHandlers.delete(name);
      if (abortOnFailure) {
        this._failPausedRequests(error);
      } else {
        this._resumePausedRequests();
      }
      
      return error; // Handler failed, pass error through
    }
  }

  /**
   * Execute handler with error handling
   */
  async _executeHandler(handler, error, context, name) {
    try {
      await handler(error, context);
    } catch (handlerError) {
      console.error(`[RecoveryInterceptor] Handler "${name}" threw error:`, handlerError);
      throw handlerError;
    }
  }

  /**
   * Retry the original request
   */
  async _retryRequest(context) {
    // Get request instance from context (stored during init)
    const request = context.context._request;
    if (!request) {
      throw new Error('[RecoveryInterceptor] Cannot retry - request reference not found');
    }
    
    // Retry the original request (already marked as attempted)
    return await request.send(context.config.body);
  }

  /**
   * Resume all paused requests (let them retry)
   */
  _resumePausedRequests() {
    const paused = [...this.pausedRequests];
    this.pausedRequests = [];
    paused.forEach(({resolve}) => resolve());
  }

  /**
   * Fail all paused requests with given error
   */
  _failPausedRequests(error) {
    const paused = [...this.pausedRequests];
    this.pausedRequests = [];
    paused.forEach(({reject}) => reject(error));
  }

  /**
   * Get recovery handlers from config and populate defaults
   */
  _getHandlers(config) {
    const recoveryConfig = config.recovery;
    
    if (!recoveryConfig) return null;
    if (typeof recoveryConfig !== 'object' || Array.isArray(recoveryConfig)) return null;
    
    // Populate defaults for each handler
    const handlersWithDefaults = {};
    
    for (const [name, handlerConfig] of Object.entries(recoveryConfig)) {
      handlersWithDefaults[name] = this._populateDefaults(handlerConfig);
    }
    
    return handlersWithDefaults;
  }

  /**
   * Populate default values for handler config
   */
  _populateDefaults(handlerConfig) {
    return {
      enable: true,
      shouldRetry: () => false,
      handler: async () => {},
      abortOnFailure: true,
      ...handlerConfig  // User values override defaults
    };
  }
}
