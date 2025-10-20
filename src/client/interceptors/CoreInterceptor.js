// src/client/interceptors/CoreInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';
import {LoggerInterceptor} from './LoggerInterceptor';
import {StatusHandlerInterceptor} from './StatusHandlerInterceptor';
import {parseResponse} from '../lib/responseParser';
// import {RetryInterceptor} from './RetryInterceptor';
// import {CancelKeyInterceptor} from './CancelKeyInterceptor';

/**
 * CoreInterceptor
 * Registers built-in interceptors and response parsing.
 */
export class CoreInterceptor extends BaseInterceptor {
  static name = 'core';

  register() {
    // Attach built-in interceptors immediately during Core registration
    this._manager.attach(LoggerInterceptor);
    this._manager.attach(StatusHandlerInterceptor);
    // this._manager.attach(RetryInterceptor);
    // this._manager.attach(CancelKeyInterceptor);

    // Set default config for JSON APIs
    this._manager.add('request:defaultConfig', 'core:defaults', this._setDefaults.bind(this), 10);

    // Wire up response parsing
    this._manager.add('request:formatData', 'core:parseResponse', this._parseResponse.bind(this), 10);
  }

  _setDefaults(config) {
    return {
      ...config,
      autoFixJson: config.autoFixJson ?? true,
      headers: {
        accept: 'application/json',
        ...config.headers,
      },
    };
  }

  async _parseResponse(response, context) {
    return await parseResponse(response, context.config);
  }
}
