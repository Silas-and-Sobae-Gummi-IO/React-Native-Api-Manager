// src/client/interceptors/CoreInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';
import {LoggerInterceptor} from './LoggerInterceptor';
import {StatusHandlerInterceptor} from './StatusHandlerInterceptor';
import {CancelKeyInterceptor} from './CancelKeyInterceptor';
import {CacheInterceptor} from './CacheInterceptor';
import {MetricsInterceptor} from './MetricsInterceptor';
import {RateLimitInterceptor} from './RateLimitInterceptor';
import {RecoveryInterceptor} from './RecoveryInterceptor';
import {RetryInterceptor} from './RetryInterceptor';
import {parseResponse} from '../lib/responseParser';

/**
 * CoreInterceptor
 * Registers built-in interceptors and response parsing.
 */
export class CoreInterceptor extends BaseInterceptor {
  static name = 'core';
  static defaultConfig = {
    autoFixJson: true,
  };

  register() {
    // Attach built-in interceptors immediately during Core registration
    this._manager.attach(LoggerInterceptor);
    this._manager.attach(StatusHandlerInterceptor);
    this._manager.attach(CancelKeyInterceptor);
    this._manager.attach(CacheInterceptor);
    this._manager.attach(MetricsInterceptor);
    this._manager.attach(RateLimitInterceptor);
    this._manager.attach(RecoveryInterceptor); // Priority 40 - runs before retry
    this._manager.attach(RetryInterceptor); // Priority 50

    // Set default headers for JSON APIs
    this._manager.add('request:defaultConfig', 'core:defaults', this._setDefaults.bind(this), 5);

    // Wire up response parsing
    this._manager.add('request:formatData', 'core:parseResponse', this._parseResponse.bind(this), 10);
  }

  _setDefaults(config) {
    return {
      ...config,
      autoFixJson: true,
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
