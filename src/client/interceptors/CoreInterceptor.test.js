// src/client/interceptors/CoreInterceptor.test.js

import {CoreInterceptor} from './CoreInterceptor';
import {ApiClient} from '../ApiClient';

describe('CoreInterceptor', () => {
  describe('Built-in Interceptor Registration', () => {
    it('attaches LoggerInterceptor on client init', () => {
      // TODO: Verify CoreInterceptor attaches logger during client:init hook
    });

    // TODO: Add tests for RetryInterceptor attachment when enabled
    // TODO: Add tests for CancelKeyInterceptor attachment when enabled
  });

  describe('parseResponse Integration', () => {
    it('wires parseResponse into request:formatResponse hook', async () => {
      // TODO: Verify CoreInterceptor calls parseResponse from responseParser.js
      // This should handle JSON parsing, 204 responses, error responses
    });

    it('handles autoFixJson config for malformed JSON responses', async () => {
      // TODO: Test that malformed JSON like "PHP Warning: blah\n{\"data\":1}" gets fixed
      // when autoFixJson: true is set in client config
    });

    it('throws ApiError with proper status and response data on error', async () => {
      // TODO: Verify parseResponse creates ApiError correctly for 4xx/5xx responses
    });

    it('supports custom onStatus handlers', async () => {
      // TODO: Test that config.onStatus[422] gets called instead of throwing error
    });
  });
});
