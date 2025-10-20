// src/client/interceptors/MetricsInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';

/**
 * MetricsInterceptor
 *
 * Tracks request metrics: duration, timestamps, size, status, etc.
 *
 * Usage:
 *   const client = new ApiClient({
 *     metrics: {
 *       enable: true,
 *       onMetrics: (metrics) => {
 *         console.log('Request took:', metrics.duration, 'ms');
 *       }
 *     }
 *   });
 */
export class MetricsInterceptor extends BaseInterceptor {
  static name = 'metrics';
  static defaultConfig = {
    enable: false,
    onMetrics: null,
  };
  
  configKey = 'metrics';

  register() {
    this._useShorthandConfig();
    
    this._manager.add('request:beforeRequest', 'metrics:start', this._onStart.bind(this), 100);
    this._manager.add('request:complete', 'metrics:end', this._onComplete.bind(this), 100);
  }

  _shouldTrack(config) {
    return config.metrics.enable === true;
  }

  _onStart({url, options, context, config}) {
    if (!this._shouldTrack(config)) {
      return;
    }

    context._metrics = {
      startTime: Date.now(),
      url,
      method: options.method,
      requestSize: this._calculateRequestSize(options),
    };
  }

  _onComplete(hookContext) {
    const {config, context} = hookContext;

    if (!this._shouldTrack(config) || !context._metrics) {
      return;
    }

    const endTime = Date.now();
    const metrics = {
      ...context._metrics,
      endTime,
      duration: endTime - context._metrics.startTime,
      status: context._response ? context._response.status : null,
      responseSize: this._calculateResponseSize(context._response),
    };

    // Call user callback if provided
    const callback = config.metrics.onMetrics;
    if (typeof callback === 'function') {
      try {
        callback(metrics);
      } catch (error) {
        // Silently catch errors in user callback
      }
    }

    // Store metrics on context for potential later use
    context.metrics = metrics;
  }

  _calculateRequestSize(options) {
    if (!options.body) {
      return 0;
    }

    try {
      if (typeof options.body === 'string') {
        return new Blob([options.body]).size;
      }
      if (options.body instanceof FormData) {
        // FormData size is difficult to calculate accurately
        return null;
      }
      // For other types, try to stringify
      return new Blob([JSON.stringify(options.body)]).size;
    } catch {
      return null;
    }
  }

  _calculateResponseSize(response) {
    if (!response) {
      return null;
    }

    // Try to get content-length header
    const contentLength = response.headers && response.headers.get ? response.headers.get('content-length') : null;
    if (contentLength) {
      return parseInt(contentLength, 10);
    }

    // Fallback: estimate from body if available
    // Note: This is approximate since we may have already consumed the body
    return null;
  }
}
