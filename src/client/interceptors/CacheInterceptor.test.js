// src/client/interceptors/CacheInterceptor.test.js

import {CacheInterceptor} from './CacheInterceptor';
import {ApiClient} from '../core/ApiClient';

describe('CacheInterceptor', () => {
  let mockFetch;
  let fetchCallCount;

  beforeEach(() => {
    fetchCallCount = 0;
    mockFetch = jest.fn(() => {
      fetchCallCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({data: `response-${fetchCallCount}`})),
      });
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Registration', () => {
    it('registers as a built-in interceptor', () => {
      const client = new ApiClient();

      expect(client.interceptors.providers.has('cache')).toBe(true);
    });

    it('registers hooks with correct priorities', () => {
      const client = new ApiClient();
      const cache = client.interceptors.providers.get('cache');

      expect(cache).toBeDefined();
      expect(client.interceptors.hooks.has('request:defaultConfig')).toBe(true);
      expect(client.interceptors.hooks.has('request:beforeRequest')).toBe(true);
      expect(client.interceptors.hooks.has('request:formatData')).toBe(true);
    });

    it('sets default cache config with enable=false', () => {
      const client = new ApiClient();
      const cache = client.interceptors.providers.get('cache');

      const defaultConfig = cache._getDefaultConfig();

      expect(defaultConfig).toMatchObject({
        enable: false,
        ttl: 60000,
        maxSize: 100,
        storage: 'memory',
      });
    });

    it('preserves user-provided cache config', () => {
      const cache = new CacheInterceptor();
      cache._manager = {}; // Mock manager

      const config = cache._normalizeConfig(
        {
          cache: {
            enable: true,
            ttl: 30000,
            maxSize: 50,
          },
        },
        'cache'
      );

      expect(config.cache.enable).toBe(true);
      expect(config.cache.ttl).toBe(30000);
      expect(config.cache.maxSize).toBe(50);
    });
  });

  describe('Caching behavior', () => {
    it('caches GET requests when enabled', async () => {
      const client = new ApiClient({
        cache: {enable: true, ttl: 60000},
      });

      // First request
      const result1 = await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result1).toEqual({data: 'response-1'});

      // Second request should use cache
      const result2 = await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, no new fetch
      expect(result2).toEqual({data: 'response-1'}); // Same cached response
    });

    it('does not cache when disabled', async () => {
      const client = new ApiClient({
        cache: {enable: false},
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/users').send();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('only caches GET requests by default', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.post('https://api.example.com/users', {name: 'John'}).send();
      await client.post('https://api.example.com/users', {name: 'John'}).send();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('respects per-request cache override', async () => {
      const client = new ApiClient({
        cache: {enable: false},
      });

      // Enable cache for this request only
      await client.get('https://api.example.com/users', {cache: true}).send();
      await client.get('https://api.example.com/users', {cache: true}).send();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('can disable cache per-request even if globally enabled', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.get('https://api.example.com/users', {cache: false}).send();
      await client.get('https://api.example.com/users', {cache: false}).send();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('caches different URLs separately', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send();

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Each should use its own cache
      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send();

      expect(mockFetch).toHaveBeenCalledTimes(2); // No new fetches
    });

    it('caches requests with different query params separately', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.get('https://api.example.com/users', {params: {page: 1}}).send();
      await client.get('https://api.example.com/users', {params: {page: 2}}).send();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('TTL expiration', () => {
    it('expires cache after TTL', async () => {
      jest.useFakeTimers();

      const client = new ApiClient({
        cache: {enable: true, ttl: 1000}, // 1 second
      });

      await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      jest.advanceTimersByTime(1001);

      await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(2); // Cache expired, new fetch

      jest.useRealTimers();
    });

    it('does not expire cache before TTL', async () => {
      jest.useFakeTimers();

      const client = new ApiClient({
        cache: {enable: true, ttl: 5000}, // 5 seconds
      });

      await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time but not past TTL
      jest.advanceTimersByTime(2000);

      await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still cached

      jest.useRealTimers();
    });

    it('supports per-request TTL override', async () => {
      jest.useFakeTimers();

      const client = new ApiClient({
        cache: {enable: true, ttl: 60000},
      });

      // Use shorter TTL for this request
      await client.get('https://api.example.com/users', {cache: {ttl: 500}}).send();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(600);

      await client.get('https://api.example.com/users', {cache: {ttl: 500}}).send();
      expect(mockFetch).toHaveBeenCalledTimes(2); // Expired

      jest.useRealTimers();
    });
  });

  describe('Cache invalidation', () => {
    it('invalidates cache on POST to same URL', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      // Cache a GET request
      await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // POST to same URL should invalidate cache
      await client.post('https://api.example.com/users', {name: 'John'}).send();

      // GET again should fetch fresh
      await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('invalidates cache on PUT to same URL', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.get('https://api.example.com/users/1').send();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await client.put('https://api.example.com/users/1', {name: 'Updated'}).send();

      await client.get('https://api.example.com/users/1').send();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('invalidates cache on DELETE to same URL', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.get('https://api.example.com/users/1').send();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await client.delete('https://api.example.com/users/1').send();

      await client.get('https://api.example.com/users/1').send();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does not invalidate cache for different URLs', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // POST to posts should not invalidate users cache
      await client.post('https://api.example.com/posts', {title: 'New'}).send();

      await client.get('https://api.example.com/users').send(); // Should use cache
      expect(mockFetch).toHaveBeenCalledTimes(3); // No new fetch for users
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when maxSize is reached', async () => {
      const client = new ApiClient({
        cache: {enable: true, maxSize: 2},
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send();
      await client.get('https://api.example.com/comments').send(); // Should evict users

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Users should be evicted, posts and comments should be cached
      // But fetching users again will evict posts (LRU with maxSize=2)
      await client.get('https://api.example.com/users').send(); // New fetch (was evicted)
      // After storing users, cache is [comments, users], posts was evicted
      await client.get('https://api.example.com/comments').send(); // Cached
      await client.get('https://api.example.com/users').send(); // Cached

      expect(mockFetch).toHaveBeenCalledTimes(4); // Only users fetched again
    });

    it('updates LRU order on cache hit', async () => {
      const client = new ApiClient({
        cache: {enable: true, maxSize: 2},
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send();

      // Access users again to make it more recent
      await client.get('https://api.example.com/users').send();

      // Add comments, should evict posts (not users)
      await client.get('https://api.example.com/comments').send();

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Users and comments should be cached, posts should be evicted
      await client.get('https://api.example.com/users').send(); // Cached (moved to end)
      await client.get('https://api.example.com/comments').send(); // Cached (moved to end)
      // After these, cache order is [users, comments], posts is still evicted
      await client.get('https://api.example.com/posts').send(); // New fetch (was evicted)

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Custom cache key generator', () => {
    it('uses custom key generator when provided', async () => {
      const keyGen = jest.fn((config) => `custom-${config.url}`);

      const client = new ApiClient({
        cache: {
          enable: true,
          keyGenerator: keyGen,
        },
      });

      await client.get('https://api.example.com/users').send();

      expect(keyGen).toHaveBeenCalled();
    });

    it('treats requests with same custom key as identical', async () => {
      const client = new ApiClient({
        cache: {
          enable: true,
          keyGenerator: () => 'same-key', // Always same key
        },
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/posts').send(); // Different URL but same key

      expect(mockFetch).toHaveBeenCalledTimes(1); // Second uses first's cache
    });
  });

  describe('shouldCache callback', () => {
    it('uses shouldCache callback to determine if response should be cached', async () => {
      const shouldCache = jest.fn((response) => response.status === 200);

      const client = new ApiClient({
        cache: {
          enable: true,
          shouldCache,
        },
      });

      await client.get('https://api.example.com/users').send();

      expect(shouldCache).toHaveBeenCalled();
    });

    it('does not cache when shouldCache returns false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve('{"data": "first"}'),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve('{"data": "second"}'),
      });

      const client = new ApiClient({
        cache: {
          enable: true,
          shouldCache: () => false, // Never cache
        },
      });

      const result1 = await client.get('https://api.example.com/users').send();
      const result2 = await client.get('https://api.example.com/users').send();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result1.data).toBe('first');
      expect(result2.data).toBe('second');
    });

    it('only caches successful responses by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map(),
        text: () => Promise.resolve('{"error": "Not found"}'),
      });

      const client = new ApiClient({
        cache: {enable: true},
      });

      try {
        await client.get('https://api.example.com/notfound').send();
      } catch (error) {
        // Expected
      }

      // Error should not be cached
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('{"data": "found"}'),
      });

      await client.get('https://api.example.com/notfound').send();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Custom storage adapter', () => {
    it('supports custom storage adapter', async () => {
      const customStorage = {
        _data: {},
        get: jest.fn((key) => customStorage._data[key] || null),
        set: jest.fn((key, value) => {
          customStorage._data[key] = value;
        }),
        invalidateByPattern: jest.fn(),
      };

      const client = new ApiClient({
        cache: {
          enable: true,
          storage: customStorage,
        },
      });

      await client.get('https://api.example.com/users').send();

      expect(customStorage.set).toHaveBeenCalled();

      await client.get('https://api.example.com/users').send();

      expect(customStorage.get).toHaveBeenCalled();
    });

    it('throws error for unsupported storage type', () => {
      expect(() => {
        const client = new ApiClient({
          cache: {
            enable: true,
            storage: 'invalid-type',
          },
        });

        const cache = client.interceptors.providers.get('cache');
        cache._getStorage({cache: {storage: 'invalid-type'}});
      }).toThrow('Unsupported cache storage type');
    });
  });

  describe('Edge cases', () => {
    it('handles cache with missing config gracefully', async () => {
      const client = new ApiClient();

      await expect(client.get('https://api.example.com/users').send()).resolves.toBeDefined();
    });

    it('handles URL parsing errors', () => {
      const client = new ApiClient({
        cache: {enable: true},
      });
      const cache = client.interceptors.providers.get('cache');

      const baseUrl = cache._extractBaseUrl('not-a-valid-url');
      expect(baseUrl).toBe('not-a-valid-url');
    });
  });

  describe('MemoryStorage', () => {
    it('stores and retrieves values', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });

      await client.get('https://api.example.com/users').send();
      await client.get('https://api.example.com/users').send();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('clears all entries', async () => {
      const client = new ApiClient({
        cache: {enable: true},
      });
      const cache = client.interceptors.providers.get('cache');
      const storage = cache._getStorage({cache: {enable: true, storage: 'memory', maxSize: 100}});

      await client.get('https://api.example.com/users').send();
      expect(storage.size).toBeGreaterThan(0);

      storage.clear();
      expect(storage.size).toBe(0);

      await client.get('https://api.example.com/users').send();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
