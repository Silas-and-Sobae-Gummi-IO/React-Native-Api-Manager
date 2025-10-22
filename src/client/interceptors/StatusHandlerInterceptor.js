// src/client/interceptors/StatusHandlerInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';

/**
 * StatusHandlerInterceptor
 * Handles custom onStatus handlers before default response parsing
 */
export class StatusHandlerInterceptor extends BaseInterceptor {
  static name = 'statusHandler';

  register() {
    // Run before parseResponse (priority 5, parseResponse is at 10)
    this._manager.add('request:formatData', this._checkStatus.bind(this), 5, 'statusHandler:check');
  }

  async _checkStatus(response, context) {
    const config = context.config;
    
    // If onStatus handler exists for this status code, use it as escape hatch
    if (config?.onStatus?.[response.status]) {
      return config.onStatus[response.status](response);
    }

    // No handler, pass through to next hook (parseResponse)
    return response;
  }
}
