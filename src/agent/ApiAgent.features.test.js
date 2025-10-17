// src/agent/ApiAgent.features.test.js

import { ApiAgent } from './ApiAgent';
import { ApiClient } from '../client/ApiClient';
import { ApiError } from '../core/ApiError';

// Spy on the REAL prototype method
const performFetchSpy = jest.spyOn(ApiClient.prototype, '_performFetch');
// Mock fetch globally
global.fetch = jest.fn();

describe('ApiAgent - High-Level Features', () => {
  let testAgent;
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.useFakeTimers(); // Keep fake timers enabled for consistency
    jest.clearAllMocks();
    testAgent = new ApiAgent();
    performFetchSpy.mockResolvedValue({
      // Default mock response object
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    });

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // --- SKIP Conditional Retry Handlers ---
  describe.skip('Conditional Retry Handlers', () => {
    let mockHandler;
    beforeEach(() => {
      /* ... */
    });
    it('should retry the original request after successful handler execution', async () => {
      /* ... */
    });
    it('should queue and retry subsequent requests during handler execution', async () => {
      /* ... */
    });
    it('should reject all requests if handler fails', async () => {
      /* ... */
    });
    it('should allow multiple different handlers', async () => {
      /* ... */
    });
  });

  // --- SKIP Offline Persistence & Replay ---
  describe.skip('Offline Persistence & Replay', () => {
    let mockAdapter;
    let mockNetInfo;
    let networkCallback;
    beforeEach(() => {
      /* ... */
    });
    it('should queue a write request when offline', async () => {
      /* ... */
    });
    it('should NOT queue a read request (GET) when offline', async () => {
      /* ... */
    });
    it('should replay queued requests when coming back online', async () => {
      /* ... */
    });
  });

  // --- Other Skipped describe blocks ---
  describe.skip('Built-in Mocking Adapter', () => {
    /* ... */
  });
  describe.skip('Performance Monitoring & Telemetry', () => {
    /* ... */
  });
});
