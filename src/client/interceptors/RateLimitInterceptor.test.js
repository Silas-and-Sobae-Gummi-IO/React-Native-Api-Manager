// src/client/interceptors/RateLimitInterceptor.test.js

import {RateLimitInterceptor} from './RateLimitInterceptor';
import {ApiClient} from '../ApiClient';

describe.skip('RateLimitInterceptor', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({data: 'test'})),
      })
    );
    global.fetch = mockFetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Registration', () => {
    it('registers as a built-in interceptor', () => {
      const client = new ApiClient();

      expect(client.interceptors.providers.has('rateLimit')).toBe(true);
    });

    it('registers hooks with correct priorities', () => {
      const client = new ApiClient();
      const rateLimit = client.interceptors.providers.get('rateLimit');

      expect(rateLimit).toBeDefined();
      expect(client.interceptors.hooks.has('request:defaultConfig')).toBe(true);
      expect(client.interceptors.hooks.has('request:beforeRequest')).toBe(true);
    });

    it('sets default rate limit config with enable=false', () => {
      const client = new ApiClient();
      const rateLimit = client.interceptors.providers.get('rateLimit');

      const config = rateLimit._setDefaults({});

      expect(config.rateLimit).toMatchObject({
        enable: false,
        maxRequests: 10,
        window: 1000,
        strategy: 'sliding',
        scope: 'global',
      });
    });

    it('preserves user-provided rate limit config', () => {
      const client = new ApiClient();
      const rateLimit = client.interceptors.providers.get('rateLimit');

      const userConfig = {
        rateLimit: {
          enable: true,
          maxRequests: 5,
          window: 2000,
        },
      };

      const config = rateLimit._setDefaults(userConfig);

      expect(config.rateLimit.enable).toBe(true);
      expect(config.rateLimit.maxRequests).toBe(5);
      expect(config.rateLimit.window).toBe(2000);
    });
  });

  describe('Global rate limiting', () => {
    it('does not rate limit when disabled', async () => {
      const client = new ApiClient({
        rateLimit: {enable: false},
      });

      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(client.get('https://api.example.com/users').send());
      }

      await Promise.all(promises);
      expect(mockFetch).toHaveBeenCalledTimes(20);
    });

    it('allows requests within limit', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 10,
          window: 1000,
        },
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(client.get('https://api.example.com/users').send());
      }

      await Promise.all(promises);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('queues requests exceeding limit with sliding window', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 3,
          window: 1000,
          strategy: 'sliding',
        },
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(client.get(`https://api.example.com/user${i}`).send());
      }

      // First 3 should execute immediately
      await jest.runOnlyPendingTimersAsync();
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Advance time to allow next batch
      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('queues requests exceeding limit with fixed window', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 3,
          window: 1000,
          strategy: 'fixed',
        },
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(client.get(`https://api.example.com/user${i}`).send());
      }

      // First 3 should execute immediately
      await jest.runOnlyPendingTimersAsync();
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Advance to next fixed window
      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('calls onRateLimit callback when rate limited', async () => {
      const onRateLimit = jest.fn();
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 2,
          window: 1000,
          onRateLimit,
        },
      });

      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(client.get(`https://api.example.com/user${i}`).send());
      }

      await jest.runOnlyPendingTimersAsync();

      expect(onRateLimit).toHaveBeenCalled();
      expect(onRateLimit.mock.calls[0][0]).toBeGreaterThan(0); // waitTime
    });

    it('silently catches errors in onRateLimit callback', async () => {
      const onRateLimit = jest.fn(() => {
        throw new Error('User callback error');
      });

      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 1,
          window: 1000,
          onRateLimit,
        },
      });

      const promises = [client.get('https://api.example.com/user1').send(), client.get('https://api.example.com/user2').send()];

      await jest.runOnlyPendingTimersAsync();

      // Should not throw despite callback error
      expect(onRateLimit).toHaveBeenCalled();
    });
  });

  describe('Per-endpoint rate limiting', () => {
    it('rate limits per endpoint separately', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 2,
          window: 1000,
          scope: 'per-endpoint',
        },
      });

      const promises = [
        client.get('https://api.example.com/users').send(),
        client.get('https://api.example.com/users').send(),
        client.get('https://api.example.com/posts').send(),
        client.get('https://api.example.com/posts').send(),
      ];

      await jest.runOnlyPendingTimersAsync();

      // All 4 should execute because they're split across 2 endpoints
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('queues requests per endpoint when limit exceeded', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 2,
          window: 1000,
          scope: 'per-endpoint',
        },
      });

      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(client.get('https://api.example.com/users').send());
      }

      await jest.runOnlyPendingTimersAsync();

      // Only 2 should execute for this endpoint
      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync();

      // Now remaining 2 should execute
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('treats endpoints with different query params as same endpoint', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 2,
          window: 1000,
          scope: 'per-endpoint',
        },
      });

      const promises = [
        client.get('https://api.example.com/users', {params: {page: 1}}).send(),
        client.get('https://api.example.com/users', {params: {page: 2}}).send(),
        client.get('https://api.example.com/users', {params: {page: 3}}).send(),
      ];

      await jest.runOnlyPendingTimersAsync();

      // Only 2 should execute (same endpoint, different params)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sliding window strategy', () => {
    it('allows new requests as old ones exit the window', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 2,
          window: 1000,
          strategy: 'sliding',
        },
      });

      // Send 2 requests at t=0
      await Promise.all([client.get('https://api.example.com/user1').send(), client.get('https://api.example.com/user2').send()]);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Try to send 3rd request, should queue
      const promise3 = client.get('https://api.example.com/user3').send();

      await jest.runOnlyPendingTimersAsync();
      expect(mockFetch).toHaveBeenCalledTimes(2); // Still 2

      // Advance past the window of first request
      jest.advanceTimersByTime(1001);
      await jest.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(3); // Now 3rd executes
    });

    it('cleans up old timestamps', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 3,
          window: 1000,
          strategy: 'sliding',
        },
      });

      const rateLimit = client.interceptors.providers.get('rateLimit');

      // Send 3 requests
      await Promise.all([
        client.get('https://api.example.com/user1').send(),
        client.get('https://api.example.com/user2').send(),
        client.get('https://api.example.com/user3').send(),
      ]);

      expect(rateLimit._getRequestCount('__global__')).toBe(3);

      // Advance time past window
      jest.advanceTimersByTime(1001);

      // Send new request to trigger cleanup
      await client.get('https://api.example.com/user4').send();

      // Should only have 1 timestamp now (the new request)
      expect(rateLimit._getRequestCount('__global__')).toBe(1);
    });
  });

  describe('Fixed window strategy', () => {
    it('resets count at window boundaries', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 2,
          window: 1000,
          strategy: 'fixed',
        },
      });

      // Send 2 requests
      await Promise.all([client.get('https://api.example.com/user1').send(), client.get('https://api.example.com/user2').send()]);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Try 3rd, should queue
      const promise3 = client.get('https://api.example.com/user3').send();

      await jest.runOnlyPendingTimersAsync();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance to next window
      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge cases', () => {
    it('handles rate limiting with missing config gracefully', async () => {
      const client = new ApiClient();

      await expect(client.get('https://api.example.com/users').send()).resolves.toBeDefined();
    });

    it('handles URL parsing errors', () => {
      const client = new ApiClient({
        rateLimit: {enable: true},
      });
      const rateLimit = client.interceptors.providers.get('rateLimit');

      const baseUrl = rateLimit._extractBaseUrl('not-a-valid-url');
      expect(baseUrl).toBe('not-a-valid-url');
    });

    it('handles rapid requests correctly', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 5,
          window: 1000,
        },
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(client.get(`https://api.example.com/user${i}`).send());
      }

      await jest.runOnlyPendingTimersAsync();

      // First 5 should execute
      expect(mockFetch).toHaveBeenCalledTimes(5);

      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync();

      // Remaining 5 should execute
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it('supports per-request rate limit override', async () => {
      const client = new ApiClient({
        rateLimit: {enable: false},
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          client
            .get(`https://api.example.com/user${i}`, {
              rateLimit: {enable: true, maxRequests: 2, window: 1000},
            })
            .send()
        );
      }

      await jest.runOnlyPendingTimersAsync();

      // Only 2 should execute
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('can disable rate limit per-request even if globally enabled', async () => {
      const client = new ApiClient({
        rateLimit: {enable: true, maxRequests: 2, window: 1000},
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          client
            .get(`https://api.example.com/user${i}`, {
              rateLimit: {enable: false},
            })
            .send()
        );
      }

      await jest.runOnlyPendingTimersAsync();

      // All 5 should execute (rate limiting disabled)
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('Utility methods', () => {
    it('getRequestCount returns correct count', async () => {
      const client = new ApiClient({
        rateLimit: {enable: true, maxRequests: 10, window: 1000},
      });
      const rateLimit = client.interceptors.providers.get('rateLimit');

      await Promise.all([
        client.get('https://api.example.com/user1').send(),
        client.get('https://api.example.com/user2').send(),
        client.get('https://api.example.com/user3').send(),
      ]);

      expect(rateLimit._getRequestCount('__global__')).toBe(3);
    });

    it('clearScope removes timestamps for scope', async () => {
      const client = new ApiClient({
        rateLimit: {enable: true, maxRequests: 10, window: 1000},
      });
      const rateLimit = client.interceptors.providers.get('rateLimit');

      await client.get('https://api.example.com/users').send();
      expect(rateLimit._getRequestCount('__global__')).toBeGreaterThan(0);

      rateLimit._clearScope('__global__');
      expect(rateLimit._getRequestCount('__global__')).toBe(0);
    });

    it('clearAll removes all timestamps', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 10,
          window: 1000,
          scope: 'per-endpoint',
        },
      });
      const rateLimit = client.interceptors.providers.get('rateLimit');

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send();

      expect(rateLimit._timestamps.size).toBeGreaterThan(0);

      rateLimit._clearAll();
      expect(rateLimit._timestamps.size).toBe(0);
    });
  });

  describe('Multiple clients', () => {
    it('each client has independent rate limits', async () => {
      const client1 = new ApiClient({
        rateLimit: {enable: true, maxRequests: 2, window: 1000},
      });

      const client2 = new ApiClient({
        rateLimit: {enable: true, maxRequests: 2, window: 1000},
      });

      // Each client should be able to make 2 requests
      await Promise.all([
        client1.get('https://api.example.com/user1').send(),
        client1.get('https://api.example.com/user2').send(),
        client2.get('https://api.example.com/user3').send(),
        client2.get('https://api.example.com/user4').send(),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Real-time behavior', () => {
    it('properly queues and executes requests over time', async () => {
      const client = new ApiClient({
        rateLimit: {
          enable: true,
          maxRequests: 2,
          window: 500,
          strategy: 'sliding',
        },
      });

      const timestamps = [];

      // Mock fetch to record execution time
      mockFetch.mockImplementation(() => {
        timestamps.push(Date.now());
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('{}'),
        });
      });

      const promises = [
        client.get('https://api.example.com/user1').send(),
        client.get('https://api.example.com/user2').send(),
        client.get('https://api.example.com/user3').send(),
        client.get('https://api.example.com/user4').send(),
      ];

      // Process first batch
      await jest.runOnlyPendingTimersAsync();
      expect(timestamps.length).toBe(2);

      // Advance and process next batch
      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(timestamps.length).toBe(4);
    });
  });
});
