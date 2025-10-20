// src/client/lib/ConfigManager.js

import {mergeHeaders} from '../../utils/headers';

/**
 * ConfigManager
 * 
 * Manages the configuration lifecycle:
 * 1. Runs `request:defaultConfig` hook with empty object to let interceptors add defaults
 * 2. Runs `request:clientConfig` hook to normalize client config (e.g., boolean shorthand)
 * 3. Runs `request:requestConfig` hook to normalize request config
 * 4. Deep merges configs (priority: bodyOverrides > request > client > defaults)
 * 5. Runs `request:prepareConfig` hook for final adjustments to merged config
 * 
 * This ensures interceptors can provide defaults and normalize shorthand syntax.
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
    // Step 1: Let interceptors add their default configs
    const defaultConfig = await this._interceptors.run('request:defaultConfig', {});

    // Step 2: Normalize client config (boolean shorthand, etc.)
    const normalizedClientConfig = await this._interceptors.run('request:clientConfig', clientConfig);

    // Step 3: Normalize request config
    const normalizedRequestConfig = await this._interceptors.run('request:requestConfig', requestConfig);

    // Step 4: Merge configs (priority: bodyOverrides > request > client > defaults)
    const headers = this._mergeHeaders(defaultConfig, normalizedClientConfig, normalizedRequestConfig);
    const body = this._mergeBody(defaultConfig, normalizedClientConfig, normalizedRequestConfig, bodyOverrides);

    // Deep merge nested config objects (auto-detect objects from defaults)
    const nestedConfigs = this._mergeNestedConfigs(defaultConfig, normalizedClientConfig, normalizedRequestConfig);

    // Shallow merge flat properties, then override with deep-merged nested configs
    // Note: nestedConfigs only contains nested objects, so we need flat properties from all levels
    const mergedConfig = {
      signal: abortSignal,
      ...this._getFlatProperties(defaultConfig, nestedConfigs),
      ...this._getFlatProperties(normalizedClientConfig, nestedConfigs),
      ...this._getFlatProperties(normalizedRequestConfig, nestedConfigs),
      ...nestedConfigs,  // Deep-merged nested configs take precedence
      body,
      headers,
    };

    // Step 5: Let interceptors make final adjustments to merged config
    return await this._interceptors.run('request:prepareConfig', mergedConfig);
  }

  /**
   * Merge headers from default, client, and request configs
   * @private
   */
  _mergeHeaders(defaultConfig, clientConfig, requestConfig) {
    return mergeHeaders(
      defaultConfig.headers,
      clientConfig.headers,
      requestConfig.headers
    );
  }

  /**
   * Extract flat (non-object) properties from config, excluding nested config keys
   * @private
   */
  _getFlatProperties(config, nestedConfigs) {
    const flat = {};
    const nestedKeys = Object.keys(nestedConfigs);
    
    Object.keys(config).forEach(key => {
      if (!nestedKeys.includes(key)) {
        flat[key] = config[key];
      }
    });
    
    return flat;
  }

  /**
   * Deep merge nested config objects
   * Auto-detects which keys need deep merging based on defaults
   * @private
   */
  _mergeNestedConfigs(defaultConfig, clientConfig, requestConfig) {
    const merged = {};

    // Auto-detect: if a key is an object in defaults, deep merge it
    Object.keys(defaultConfig).forEach(key => {
      const defaultVal = defaultConfig[key];
      const clientVal = clientConfig[key];
      const requestVal = requestConfig[key];
      
      // Only deep merge objects (not arrays, not primitives)
      if (typeof defaultVal === 'object' && defaultVal !== null && !Array.isArray(defaultVal)) {
        merged[key] = {
          ...defaultVal,
          ...(typeof clientVal === 'object' && clientVal !== null ? clientVal : {}),
          ...(typeof requestVal === 'object' && requestVal !== null ? requestVal : {}),
        };
      }
    });

    return merged;
  }

  /**
   * Merge body from default, client, request, and override configs
   * Handles FormData special case (non-mergeable)
   * @private
   */
  _mergeBody(defaultConfig, clientConfig, requestConfig, bodyOverrides) {
    let finalBody = undefined;

    // Start with default-level body
    if (defaultConfig.body) {
      finalBody = {...defaultConfig.body};
    }

    // Merge with client-level body (should always be plain object)
    if (clientConfig.body) {
      finalBody = {...(finalBody || {}), ...clientConfig.body};
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
