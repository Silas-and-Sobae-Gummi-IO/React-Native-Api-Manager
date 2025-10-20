// src/client/lib/ConfigManager.js

import {mergeHeaders} from '../../utils/headers';

/**
 * ConfigManager
 * 
 * Responsible for merging user configurations from multiple sources:
 * - Client-level config
 * - Request-level config
 * - Send-time body overrides
 * 
 * Then runs the `request:defaultConfig` hook to let interceptors normalize
 * and set defaults for their namespaces.
 */
export class ConfigManager {
  constructor(interceptorManager) {
    this._interceptors = interceptorManager;
  }

  /**
   * Prepare final merged config
   * @param {object} clientConfig - Client-level config
   * @param {object} requestConfig - Request-level config
   * @param {object} bodyOverrides - Send-time body overrides
   * @param {AbortSignal} abortSignal - Abort controller signal
   * @returns {Promise<object>} Final merged config
   */
  async prepare(clientConfig, requestConfig, bodyOverrides, abortSignal) {
    const headers = this._mergeHeaders(clientConfig, requestConfig);
    const body = this._mergeBody(clientConfig, requestConfig, bodyOverrides);

    // Merge all configs (priority: request > client)
    const rawMergedConfig = {
      signal: abortSignal,
      ...clientConfig,
      ...requestConfig,
      body,
      headers,
    };

    // Run defaultConfig hook to let interceptors normalize and set defaults
    return await this._interceptors.run('request:defaultConfig', rawMergedConfig);
  }

  /**
   * Merge headers from client and request configs
   * @private
   */
  _mergeHeaders(clientConfig, requestConfig) {
    return mergeHeaders(
      clientConfig.headers,
      requestConfig.headers
    );
  }

  /**
   * Merge body from client, request, and override configs
   * Handles FormData special case (non-mergeable)
   * @private
   */
  _mergeBody(clientConfig, requestConfig, bodyOverrides) {
    let finalBody = undefined;

    // Start with client-level body (should always be plain object)
    if (clientConfig.body) {
      finalBody = {...clientConfig.body};
    }

    // Merge or replace with request-level body
    if (requestConfig.body !== undefined) {
      if (requestConfig.body instanceof FormData) {
        // FormData replaces everything, can't merge
        finalBody = requestConfig.body;
      } else if (typeof requestConfig.body === 'object' && requestConfig.body !== null) {
        finalBody = {...(finalBody || {}), ...requestConfig.body};
      } else {
        finalBody = requestConfig.body;
      }
    }

    // Merge or replace with send-time overrides
    if (bodyOverrides instanceof FormData) {
      // FormData replaces everything, can't merge
      finalBody = bodyOverrides;
    } else if (typeof bodyOverrides === 'object' && bodyOverrides !== null && Object.keys(bodyOverrides).length > 0) {
      finalBody = {...(finalBody || {}), ...bodyOverrides};
    } else if (bodyOverrides !== undefined && bodyOverrides !== null && Object.keys(bodyOverrides || {}).length > 0) {
      finalBody = bodyOverrides;
    }

    return finalBody;
  }
}
