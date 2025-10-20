// src/client/interceptors/CancelKeyInterceptor.test.js

import {CancelKeyInterceptor} from './CancelKeyInterceptor';
import {ApiClient} from '../ApiClient';

describe('CancelKeyInterceptor', () => {
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Registration', () => {
    it('registers as a built-in interceptor', () => {
      const client = new ApiClient();

      expect(client.interceptors.providers.has('cancelKey')).toBe(true);
    });

    it('registers context and complete hooks', () => {
      const client = new ApiClient();
      const cancelKeyInterceptor = client.interceptors.providers.get('cancelKey');

      expect(cancelKeyInterceptor).toBeDefined();
      expect(client.interceptors.hooks.has('request:context')).toBe(true);
      expect(client.interceptors.hooks.has('request:complete')).toBe(true);
    });
  });

  describe('Request cancellation', () => {
    it('does nothing when no cancelKey is provided', async () => {
      const client = new ApiClient();
      const request1 = client.get('https://api.example.com/test1');
      const request2 = client.get('https://api.example.com/test2');

      const abortSpy1 = jest.spyOn(request1._abortController, 'abort');
      const abortSpy2 = jest.spyOn(request2._abortController, 'abort');

      await request1.send();
      await request2.send();

      expect(abortSpy1).not.toHaveBeenCalled();
      expect(abortSpy2).not.toHaveBeenCalled();
    });

    it('cancels previous request with same cancelKey', async () => {
      const client = new ApiClient();
      
      // Create slow mock that respects abort signal
      mockFetch.mockImplementation(
        (url, options) => new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve({
            ok: true,
            status: 200,
            headers: new Map(),
            text: () => Promise.resolve('{}'),
          }), 100);
          
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
      );

      const request1 = client.get('https://api.example.com/search', {
        cancelKey: 'search',
        params: {q: 'abc'},
      });
      const request2 = client.get('https://api.example.com/search', {
        cancelKey: 'search',
        params: {q: 'abcd'},
      });

      const abortSpy1 = jest.spyOn(request1._abortController, 'abort');

      const promise1 = request1.send();
      await new Promise(resolve => setImmediate(resolve)); // Let first request start
      const promise2 = request2.send();

      // First request should be aborted
      expect(abortSpy1).toHaveBeenCalledWith('cancelKey');

      await expect(promise1).rejects.toThrow();
      await expect(promise2).resolves.toBeDefined();
    });

    it('allows multiple requests with different cancelKeys to run simultaneously', async () => {
      const client = new ApiClient();
      
      const request1 = client.get('https://api.example.com/users', {
        cancelKey: 'users',
      });
      const request2 = client.get('https://api.example.com/posts', {
        cancelKey: 'posts',
      });

      const abortSpy1 = jest.spyOn(request1._abortController, 'abort');
      const abortSpy2 = jest.spyOn(request2._abortController, 'abort');

      const [result1, result2] = await Promise.all([
        request1.send(),
        request2.send(),
      ]);

      expect(abortSpy1).not.toHaveBeenCalled();
      expect(abortSpy2).not.toHaveBeenCalled();
      expect(result1).toEqual({data: 'test'});
      expect(result2).toEqual({data: 'test'});
    });

    it('handles rapid successive requests with same cancelKey', async () => {
      const client = new ApiClient();
      const cancelKey = 'rapid-search';

      // Mock slow responses that respect abort signal
      mockFetch.mockImplementation(
        (url, options) => new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]),
            text: () => Promise.resolve('{"data":"test"}'),
          }), 50);
          
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
      );

      const requests = [];
      const promises = [];

      // Fire 5 rapid requests
      for (let i = 0; i < 5; i++) {
        const request = client.get('https://api.example.com/search', {
          cancelKey,
          params: {q: `query${i}`},
        });
        requests.push(request);
        promises.push(request.send().catch(() => 'aborted'));
        await new Promise(resolve => setImmediate(resolve));
      }

      const results = await Promise.all(promises);

      // First 4 should be aborted, last one should succeed
      expect(results.slice(0, 4).every(r => r === 'aborted')).toBe(true);
      expect(results[4]).toEqual({data: 'test'});
    });

    it('does not cancel request if cancelKey is different', async () => {
      const client = new ApiClient();
      
      const request1 = client.get('https://api.example.com/search', {
        cancelKey: 'search1',
      });
      const request2 = client.get('https://api.example.com/search', {
        cancelKey: 'search2',
      });

      const abortSpy1 = jest.spyOn(request1._abortController, 'abort');
      const abortSpy2 = jest.spyOn(request2._abortController, 'abort');

      await Promise.all([request1.send(), request2.send()]);

      expect(abortSpy1).not.toHaveBeenCalled();
      expect(abortSpy2).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('cleans up cancelKey map after request completes', async () => {
      const client = new ApiClient();
      const cancelKeyInterceptor = client.interceptors.providers.get('cancelKey');
      
      const request = client.get('https://api.example.com/test', {
        cancelKey: 'test-key',
      });

      await request.send();

      // Map should be cleaned up after completion
      expect(cancelKeyInterceptor._cancelMap.has('test-key')).toBe(false);
    });

    it('cleans up cancelKey map even when request fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new ApiClient();
      const cancelKeyInterceptor = client.interceptors.providers.get('cancelKey');
      
      const request = client.get('https://api.example.com/test', {
        cancelKey: 'test-key',
      });

      try {
        await request.send();
      } catch (error) {
        // Expected
      }

      // Map should be cleaned up even on error
      expect(cancelKeyInterceptor._cancelMap.has('test-key')).toBe(false);
    });

    it('only cleans up if current request matches stored controller', async () => {
      const client = new ApiClient();
      const cancelKeyInterceptor = client.interceptors.providers.get('cancelKey');
      
      mockFetch.mockImplementation(
        () => new Promise((resolve) => {
          setTimeout(() => resolve({
            ok: true,
            status: 200,
            headers: new Map(),
            text: () => Promise.resolve('{}'),
          }), 50);
        })
      );

      const request1 = client.get('https://api.example.com/test', {
        cancelKey: 'shared-key',
      });
      const request2 = client.get('https://api.example.com/test', {
        cancelKey: 'shared-key',
      });

      const promise1 = request1.send().catch(() => 'aborted');
      await new Promise(resolve => setImmediate(resolve));
      const promise2 = request2.send();

      await Promise.all([promise1, promise2]);

      // After both complete, the key should be cleaned up
      expect(cancelKeyInterceptor._cancelMap.has('shared-key')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles undefined cancelKey gracefully', async () => {
      const client = new ApiClient();
      
      const request = client.get('https://api.example.com/test', {
        cancelKey: undefined,
      });

      await expect(request.send()).resolves.toBeDefined();
    });

    it('handles null cancelKey gracefully', async () => {
      const client = new ApiClient();
      
      const request = client.get('https://api.example.com/test', {
        cancelKey: null,
      });

      await expect(request.send()).resolves.toBeDefined();
    });

    it('handles empty string cancelKey', async () => {
      const client = new ApiClient();
      
      // Empty string is falsy, so cancelKey won't be processed
      mockFetch.mockImplementation(
        (url, options) => new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve({
            ok: true,
            status: 200,
            headers: new Map(),
            text: () => Promise.resolve('{}'),
          }), 50);
          
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
      );

      const request1 = client.get('https://api.example.com/test', {
        cancelKey: '',
      });
      const request2 = client.get('https://api.example.com/test', {
        cancelKey: '',
      });

      const promise1 = request1.send();
      const promise2 = request2.send();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Empty string is falsy, so neither should be cancelled
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('handles abort errors gracefully', async () => {
      const client = new ApiClient();
      const cancelKeyInterceptor = client.interceptors.providers.get('cancelKey');
      
      // Mock abort to throw
      const mockController = {
        abort: jest.fn(() => {
          throw new Error('Abort failed');
        }),
      };
      
      cancelKeyInterceptor._cancelMap.set('test-key', mockController);

      const request = client.get('https://api.example.com/test', {
        cancelKey: 'test-key',
      });

      // Should not throw even if previous abort fails
      await expect(request.send()).resolves.toBeDefined();
    });

    it('can be disabled by removing interceptor', async () => {
      const client = new ApiClient({
        interceptors: ['-cancelKey'],
      });

      expect(client.interceptors.providers.has('cancelKey')).toBe(false);

      // Requests with same cancelKey should both succeed
      const request1 = client.get('https://api.example.com/test', {
        cancelKey: 'test',
      });
      const request2 = client.get('https://api.example.com/test', {
        cancelKey: 'test',
      });

      const results = await Promise.all([request1.send(), request2.send()]);

      expect(results[0]).toEqual({data: 'test'});
      expect(results[1]).toEqual({data: 'test'});
    });
  });

  describe('Real-world scenarios', () => {
    it('search autocomplete: only latest search executes', async () => {
      const client = new ApiClient();
      
      mockFetch.mockImplementation((url, options) => {
        const query = new URL(url).searchParams.get('q');
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]),
            text: () => Promise.resolve(JSON.stringify({results: [query]})),
          }), 30);
          
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const searches = ['a', 'ab', 'abc', 'abcd'];
      const promises = [];
      
      // Fire requests sequentially with small delays to ensure cancellation happens
      for (const query of searches) {
        const request = client.get('https://api.example.com/search', {
          cancelKey: 'autocomplete',
          params: {q: query},
        });
        promises.push(request.send().catch(() => null));
        await new Promise(resolve => setImmediate(resolve)); // Let each start before firing next
      }

      const results = await Promise.all(promises);

      // First 3 should be cancelled (null), last should succeed
      expect(results.slice(0, 3)).toEqual([null, null, null]);
      expect(results[3]).toEqual({results: ['abcd']});
    });

    it('tab switching: cancel previous tab requests', async () => {
      const client = new ApiClient();
      
      mockFetch.mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]),
            text: () => Promise.resolve(JSON.stringify({url})),
          }), 50);
          
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      // User switches tabs rapidly
      const tab1Request = client.get('https://api.example.com/tab1', {
        cancelKey: 'current-tab',
      });
      const promise1 = tab1Request.send().catch(() => 'cancelled');

      await new Promise(resolve => setImmediate(resolve));

      const tab2Request = client.get('https://api.example.com/tab2', {
        cancelKey: 'current-tab',
      });
      const promise2 = tab2Request.send().catch(() => 'cancelled');

      await new Promise(resolve => setImmediate(resolve));

      const tab3Request = client.get('https://api.example.com/tab3', {
        cancelKey: 'current-tab',
      });
      const promise3 = tab3Request.send();

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      expect(result1).toBe('cancelled');
      expect(result2).toBe('cancelled');
      expect(result3).toEqual({url: 'https://api.example.com/tab3'});
    });
  });
});
