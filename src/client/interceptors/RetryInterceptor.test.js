// src/client/interceptors/RetryInterceptor.test.js

import {ApiClient} from '../core/ApiClient';

describe('RetryInterceptor', () => {
  let mockFetch;

  beforeEach(() => {
    jest.useFakeTimers();
    let call = 0;
    mockFetch = jest.fn(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({ok: false, status: 500, headers: new Map([['content-type', 'application/json']]), text: () => Promise.resolve('{}')});
      }
      return Promise.resolve({ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), text: () => Promise.resolve('{"ok":true}')});
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('retries on 500 and succeeds on second attempt (exponential backoff)', async () => {
    const client = new ApiClient({retry: {enable: true, maxAttempts: 2, backoff: {type: 'fixed', base: 100, jitter: 'none'}}});

    const p = client.get('https://api.example.com/users').send();

    // Advance time to allow retry
    jest.advanceTimersByTime(100);
    await jest.runAllTimersAsync();

    const data = await p;
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(data).toEqual({ok: true});
  });

  it('does not exceed maxAttempts', async () => {
    // Always 500
    mockFetch.mockImplementation(() =>
      Promise.resolve({ok: false, status: 500, headers: new Map([['content-type', 'application/json']]), text: () => Promise.resolve('{}')})
    );

    const client = new ApiClient({retry: {enable: true, maxAttempts: 3, backoff: {type: 'fixed', base: 50, jitter: 'none'}}});

    const p = client
      .get('https://api.example.com/users')
      .send()
      .catch((e) => e);

    jest.advanceTimersByTime(50);
    await jest.runOnlyPendingTimersAsync();
    jest.advanceTimersByTime(50);
    await jest.runAllTimersAsync();

    const err = await p;
    expect(err && err.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries network errors', async () => {
    let call = 0;
    mockFetch.mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.reject(new TypeError('Network error'));
      return Promise.resolve({ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), text: () => Promise.resolve('{"ok":true}')});
    });

    const client = new ApiClient({retry: {enable: true, maxAttempts: 2, backoff: {type: 'fixed', base: 10, jitter: 'none'}}});

    const p = client.get('https://api.example.com/users').send();
    jest.advanceTimersByTime(10);
    await jest.runAllTimersAsync();

    const data = await p;
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(data).toEqual({ok: true});
  });

  it('respects allowed methods (no POST by default)', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({ok: false, status: 500, headers: new Map([['content-type', 'application/json']]), text: () => Promise.resolve('{}')})
    );
    const client = new ApiClient({retry: {enable: true, maxAttempts: 2, backoff: {type: 'fixed', base: 10, jitter: 'none'}}});

    const p = client
      .post('https://api.example.com/users', {name: 'a'})
      .send()
      .catch((e) => e);

    // Even if we advance timers, should not retry POST
    jest.advanceTimersByTime(1000);
    await jest.runAllTimersAsync();

    const err = await p;
    // Ensure we consumed the rejection
    expect(err && err.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('supports custom retryOn function', async () => {
    let call = 0;
    mockFetch.mockImplementation(() => {
      call += 1;
      if (call === 1)
        return Promise.resolve({ok: false, status: 418, headers: new Map([['content-type', 'application/json']]), text: () => Promise.resolve('{}')});
      return Promise.resolve({ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), text: () => Promise.resolve('{"ok":true}')});
    });

    const client = new ApiClient({
      retry: {enable: true, maxAttempts: 2, retryOn: (resp) => resp.status === 418, backoff: {type: 'fixed', base: 10, jitter: 'none'}},
    });

    const p = client.get('https://api.example.com/t').send();
    jest.advanceTimersByTime(10);
    await jest.runAllTimersAsync();
    const data = await p;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(data).toEqual({ok: true});
  });
});
