// src/client/interceptors/CoreInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';
import {LoggerInterceptor} from './LoggerInterceptor';
// import {RetryInterceptor} from './RetryInterceptor';
// import {CancelKeyInterceptor} from './CancelKeyInterceptor';

/**
 * CoreInterceptor
 * Registers built-in interceptors on client initialization.
 */
export class CoreInterceptor extends BaseInterceptor {
  static name = 'core';

  register() {
    this._manager.add('client:init', 'core:attachBuiltIns', this._attachBuiltInInterceptors.bind(this), 10);
  }

  _attachBuiltInInterceptors() {
    this._manager.attach(LoggerInterceptor);
    // this._manager.attach('retry', RetryInterceptor);
    // this._manager.attach('cancelKey', CancelKeyInterceptor);
  }
}
