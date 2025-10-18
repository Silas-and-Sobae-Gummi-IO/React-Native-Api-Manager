// src/client/interceptors/CoreInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';
import {LoggerInterceptor} from './LoggerInterceptor';
import {RetryInterceptor} from './RetryInterceptor';
import {CancelKeyInterceptor} from './CancelKeyInterceptor';

/**
 * CoreInterceptor
 * Registers built-in interceptors on client initialization.
 */
export class CoreInterceptor extends BaseInterceptor {
  register(hooks, client) {
    this.hooks = hooks;
    this.client = client;

    // Apply defaults on client init
    hooks.attach(
      'core',
      class extends BaseInterceptor {
        register(hooks, client) {
          hooks.add('applyDefaults', async (cfg, ctx) => {
            const out = {...cfg};
            if (out.debug == null) out.debug = false;
            if (!out.headers) out.headers = {};
            return out;
          });
        }
      }
    );

    // Boot built-in interceptors when client is initialized
    hooks.attach(
      'coreBoot',
      class extends BaseInterceptor {
        register(hooks, clientInstance) {
          (async () => {
            clientInstance.config = await hooks.run('applyDefaults', clientInstance.config, {client: clientInstance});

            hooks.attach('logger', LoggerInterceptor);
            hooks.attach('retry', RetryInterceptor);
            hooks.attach('cancelKey', CancelKeyInterceptor);
          })();
        }
      }
    );
  }
}
