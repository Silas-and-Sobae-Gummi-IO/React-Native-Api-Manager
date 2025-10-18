// src/client/ApiClient.cancelKey.test.js

import { ApiClient } from './ApiClient';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';

jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');

describe('ApiClient - cancelKey behavior', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
    parseResponse.mockResolvedValue({ ok: true });
  });

  // Helper AbortError-like object
  const abortErr = { name: 'AbortError', message: 'aborted' };

  it('aborts previous request when a new one with the same cancelKey starts', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com' });

buildRequestConfig.mockImplementation((cfg) => ({ url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal }));

    let firstSignal;
    global.fetch.mockImplementationOnce((url, options) => {
      firstSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(abortErr));
        // otherwise never resolve
      });
    });

    const p1 = client.get('/resource', { cancelKey: 'same' });

    // Let the first request progress to the fetch call so the abort listener is attached
    await Promise.resolve();

    // Second call resolves successfully
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ done: true }) })
    );

    const p2 = client.get('/resource', { cancelKey: 'same' });

    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    await expect(p2).resolves.toEqual({ ok: true });
    expect(firstSignal.aborted).toBe(true);
  });
});
