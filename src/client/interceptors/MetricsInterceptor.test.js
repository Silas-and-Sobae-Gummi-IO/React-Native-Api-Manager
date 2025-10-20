// src/client/interceptors/MetricsInterceptor.test.js

import {MetricsInterceptor} from './MetricsInterceptor';
import {ApiClient} from '../ApiClient';

describe('MetricsInterceptor', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'application/json'],
          ['content-length', '42'],
        ]),
        text: () => Promise.resolve(JSON.stringify({data: 'test'})),
      })
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Registration', () => {
    it('registers as a built-in interceptor', () => {
      const client = new ApiClient();

      expect(client.interceptors.providers.has('metrics')).toBe(true);
    });

    it('registers hooks with correct priorities', () => {
      const client = new ApiClient();
      const metrics = client.interceptors.providers.get('metrics');

      expect(metrics).toBeDefined();
      expect(client.interceptors.hooks.has('request:defaultConfig')).toBe(true);
      expect(client.interceptors.hooks.has('request:beforeRequest')).toBe(true);
      expect(client.interceptors.hooks.has('request:complete')).toBe(true);
    });

    it('sets default metrics config with enable=false', () => {
      const client = new ApiClient();
      const metrics = client.interceptors.providers.get('metrics');

      const config = metrics._setDefaults({});

      expect(config.metrics).toEqual({
        enable: false,
        onMetrics: null,
      });
    });

    it('preserves user-provided metrics config', () => {
      const client = new ApiClient();
      const metrics = client.interceptors.providers.get('metrics');

      const userConfig = {
        metrics: {
          enable: true,
          onMetrics: jest.fn(),
        },
      };

      const config = metrics._setDefaults(userConfig);

      expect(config.metrics.enable).toBe(true);
      expect(config.metrics.onMetrics).toBe(userConfig.metrics.onMetrics);
    });
  });

  describe('Metrics tracking', () => {
    it('tracks basic request metrics when enabled', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {
          enable: true,
          onMetrics,
        },
      });

      await client.get('https://api.example.com/users').send();

      expect(onMetrics).toHaveBeenCalledTimes(1);
      const metrics = onMetrics.mock.calls[0][0];

      expect(metrics).toMatchObject({
        url: 'https://api.example.com/users',
        method: 'GET',
        status: 200,
        requestSize: 0,
        responseSize: 42,
      });
      expect(metrics.startTime).toBeGreaterThan(0);
      expect(metrics.endTime).toBeGreaterThan(metrics.startTime);
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
    });

    it('does not track metrics when disabled', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {
          enable: false,
          onMetrics,
        },
      });

      await client.get('https://api.example.com/users').send();

      expect(onMetrics).not.toHaveBeenCalled();
    });

    it('does not track metrics when metrics config is missing', async () => {
      const client = new ApiClient();

      const request = client.get('https://api.example.com/users');
      const result = await request.send();

      // Should not throw, just skip tracking
      expect(result).toEqual({data: 'test'});
    });

    it('tracks POST request with correct method', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await client.post('https://api.example.com/users', {name: 'John'}).send();

      expect(onMetrics).toHaveBeenCalled();
      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.method).toBe('POST');
    });

    it('tracks failed requests correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map([['content-length', '15']]),
        text: () => Promise.resolve('{"error":"Not found"}'),
      });

      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      try {
        await client.get('https://api.example.com/notfound').send();
      } catch (error) {
        // Expected to throw
      }

      expect(onMetrics).toHaveBeenCalled();
      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.status).toBe(404);
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
    });

    it('stores metrics on context', async () => {
      const client = new ApiClient({
        metrics: {enable: true},
      });

      const request = client.get('https://api.example.com/users');
      await request.send();

      expect(request._context.metrics).toBeDefined();
      expect(request._context.metrics.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Request size calculation', () => {
    it('calculates string body size', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await client.post('https://api.example.com/data', {name: 'Test'}).send();

      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.requestSize).toBeGreaterThan(0);
    });

    it('returns 0 for GET requests with no body', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await client.get('https://api.example.com/users').send();

      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.requestSize).toBe(0);
    });

    it('returns null for FormData bodies', () => {
      const client = new ApiClient();
      const metrics = client.interceptors.providers.get('metrics');

      const formData = new FormData();
      formData.append('file', 'test');

      const size = metrics._calculateRequestSize({body: formData});
      expect(size).toBeNull();
    });

    it('handles calculation errors gracefully', () => {
      const client = new ApiClient();
      const metrics = client.interceptors.providers.get('metrics');

      const circularObj = {};
      circularObj.self = circularObj;

      const size = metrics._calculateRequestSize({body: circularObj});
      expect(size).toBeNull();
    });
  });

  describe('Response size calculation', () => {
    it('reads content-length header when available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '1234']]),
        text: () => Promise.resolve('{}'),
      });

      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await client.get('https://api.example.com/users').send();

      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.responseSize).toBe(1234);
    });

    it('returns null when content-length header is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('{}'),
      });

      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await client.get('https://api.example.com/users').send();

      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.responseSize).toBeNull();
    });

    it('returns null when response is missing', () => {
      const client = new ApiClient();
      const metrics = client.interceptors.providers.get('metrics');

      const size = metrics._calculateResponseSize(null);
      expect(size).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('silently catches errors in user callback', async () => {
      const onMetrics = jest.fn(() => {
        throw new Error('User callback error');
      });

      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      // Should not throw despite user callback error
      await expect(
        client.get('https://api.example.com/users').send()
      ).resolves.toBeDefined();

      expect(onMetrics).toHaveBeenCalled();
    });

    it('handles missing context gracefully', () => {
      const client = new ApiClient({
        metrics: {enable: true},
      });
      const metrics = client.interceptors.providers.get('metrics');

      // Call complete without start
      expect(() => {
        metrics._onComplete({
          config: {metrics: {enable: true}},
          context: {},
        });
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('tracks network errors correctly', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      try {
        await client.get('https://api.example.com/users').send();
      } catch (error) {
        // Expected
      }

      expect(onMetrics).toHaveBeenCalled();
      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
      expect(metrics.status).toBeNull();
    });

    it('handles aborted requests', async () => {
      mockFetch.mockImplementation(
        (url, options) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  headers: new Map(),
                  text: () => Promise.resolve('{}'),
                }),
              100
            );

            options.signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          })
      );

      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      const request = client.get('https://api.example.com/slow');
      setTimeout(() => request.abort(), 10);

      try {
        await request.send();
      } catch (error) {
        // Expected
      }

      expect(onMetrics).toHaveBeenCalled();
      const metrics = onMetrics.mock.calls[0][0];
      expect(metrics.duration).toBeLessThan(100);
    });

    it('works with per-request metrics override', async () => {
      const globalMetrics = jest.fn();
      const perRequestMetrics = jest.fn();

      const client = new ApiClient({
        metrics: {enable: true, onMetrics: globalMetrics},
      });

      // Per-request should override global
      await client
        .get('https://api.example.com/users', {
          metrics: {enable: true, onMetrics: perRequestMetrics},
        })
        .send();

      expect(perRequestMetrics).toHaveBeenCalled();
      expect(globalMetrics).not.toHaveBeenCalled();
    });

    it('can disable metrics per-request even if globally enabled', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await client
        .get('https://api.example.com/users', {
          metrics: {enable: false},
        })
        .send();

      expect(onMetrics).not.toHaveBeenCalled();
    });
  });

  describe('Multiple requests', () => {
    it('tracks metrics for multiple simultaneous requests', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await Promise.all([
        client.get('https://api.example.com/users').send(),
        client.get('https://api.example.com/posts').send(),
        client.get('https://api.example.com/comments').send(),
      ]);

      expect(onMetrics).toHaveBeenCalledTimes(3);
      expect(onMetrics.mock.calls[0][0].url).toContain('users');
      expect(onMetrics.mock.calls[1][0].url).toContain('posts');
      expect(onMetrics.mock.calls[2][0].url).toContain('comments');
    });

    it('each request has independent metrics', async () => {
      const onMetrics = jest.fn();
      const client = new ApiClient({
        metrics: {enable: true, onMetrics},
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send();

      const metrics1 = onMetrics.mock.calls[0][0];
      const metrics2 = onMetrics.mock.calls[1][0];

      expect(metrics1.url).not.toBe(metrics2.url);
      expect(metrics1.startTime).not.toBe(metrics2.startTime);
    });
  });
});
