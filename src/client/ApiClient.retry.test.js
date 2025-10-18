// src/client/ApiClient.retry.test.js

import { ApiClient } from './ApiClient';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';

jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');

describe('ApiClient - Retry behavior', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries on specific status codes with delay', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com' });

    buildRequestConfig.mockReturnValue({ url: 'https://api.test.com/svc', method: 'GET' });

    // First attempt: parseResponse throws 503 ApiError, second attempt: resolves
    const apiErr = { name: 'ApiError', message: '503', status: 503, response: { status: 503 } };
    parseResponse
      .mockRejectedValueOnce(apiErr)
      .mockResolvedValueOnce({ ok: true });

    global.fetch.mockResolvedValue({ ok: false, status: 503 });

    const p = client.get('/svc', {
      retries: 1,
      retryOn: [503],
      retryDelay: () => 500,
    });

    // After first failure, nothing yet until we advance timers
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(500);

    const result = await p;
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('retries on network errors when configured', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com' });

    buildRequestConfig.mockReturnValue({ url: 'https://api.test.com/nw', method: 'GET' });

    // First fetch rejects like a network error (no response), second resolves and parser returns data
    global.fetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });

    parseResponse.mockResolvedValue({ ok: true });

    const result = await client.get('/nw', {
      retries: 1,
      retryOn: ['network-error'],
      retryDelay: () => 0,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });
});
