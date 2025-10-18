// src/client/interceptors/CoreInterceptor.js

import { BaseInterceptor } from './BaseInterceptor'
import { LoggerInterceptor } from './LoggerInterceptor'
import { RetryInterceptor } from './RetryInterceptor'
import { CancelKeyInterceptor } from './CancelKeyInterceptor'

/**
 * CoreInterceptor
 * Applies defaults and registers built-in interceptors on client_init.
 */
export class CoreInterceptor extends BaseInterceptor {
  register(hooks, client) {
    this.hooks = hooks
    this.client = client
    hooks.addFilter('default_config', 'core:defaults', this._applyDefaults, 0)
    hooks.addAction('client_init', 'core:boot', this._bootBuiltIns, 5)
  }

  _applyDefaults = (cfg) => {
    const out = { ...cfg }
    if (out.debug == null) out.debug = false
    if (!out.headers) out.headers = {}
    if (!out.retry) {
      out.retry = { attempts: 0, on: [503, 'network-error'], delay: () => 0 }
    }
    return out
  }

  _bootBuiltIns = (clientInstance) => {
    const hooks = clientInstance.interceptors
    clientInstance.config = hooks.applyFilters('default_config', clientInstance.config, { client: clientInstance })

    hooks.add('logger', LoggerInterceptor)
    hooks.add('retry', RetryInterceptor)
    hooks.add('cancelKey', CancelKeyInterceptor)
  }
}
