// src/client/ApiClient.timeout.test.js

import { ApiClient } from './ApiClient';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';

jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');

// Helper to create an AbortError-like object
function createAbortError() {
  return { name: 'AbortError', message: 'The operation was aborted.' };
}

describe('ApiClient - Timeout behavior', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    global.fetch = jest.fn();
    parseResponse.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts and throws ApiError on request timeout', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com', timeout: 1000 });

buildRequestConfig.mockImplementation((cfg) => ({ url: 'https://api.test.com/slow', method: 'GET', signal: cfg.signal }));

    let receivedSignal;
    global.fetch.mockImplementation((url, options) => {
      receivedSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(createAbortError()));
      });
    });

    const p = client.get('/slow');

    // Attach rejection expectation BEFORE advancing timers to avoid unhandled rejection
    const expectRejection = expect(p).rejects.toThrow('Request timed out after 1000ms');

    await jest.advanceTimersByTimeAsync(1000);

    await expectRejection;
    expect(receivedSignal.aborted).toBe(true);
  });

  it('clears timeout when request completes successfully before deadline', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com', timeout: 1000 });

    const clearSpy = jest.spyOn(global, 'clearTimeout');

buildRequestConfig.mockImplementation((cfg) => ({ url: 'https://api.test.com/ok', method: 'GET', signal: cfg.signal }));

    global.fetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });

    const result = await client.get('/ok');
    expect(result).toEqual({ ok: true });

    // Move time far past the timeout and ensure no late abort occurs
    await jest.advanceTimersByTimeAsync(5000);

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
