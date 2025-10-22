// src/client/interceptors/CacheInterceptor.js

import {BaseInterceptor} from './BaseInterceptor';

/**
 * CacheInterceptor
 *
 * Caches GET requests with TTL and automatic invalidation.
 *
 * Usage:
 *   const client = new ApiClient({
 *     cache: {
 *       enable: true,
 *       ttl: 60000,  // 1 minute
 *       maxSize: 100,
 *       storage: 'memory',  // 'memory' or custom adapter
 *     }
 *   });
 *
 *   // Per-request override
 *   client.get('/users', { cache: true }); // or { cache: { ttl: 30000 } }
 */
export class CacheInterceptor extends BaseInterceptor {
  static name = 'cache';
  static defaultConfig = {
    enable: false,
    ttl: 60000,
    maxSize: 100,
    storage: 'memory',
    keyGenerator: null,
    shouldCache: null,
  };
  
  configKey = 'cache';

  constructor() {
    super();
    this._storage = null;
  }

  register() {
    this._useShorthandConfig();
    
    this._manager.add('request:beforeRequest', this._invalidateCache.bind(this), 40, 'cache:invalidate');
    this._manager.add('request:beforeRequest', this._checkCache.bind(this), 50, 'cache:check');
    // Skip fetch and return cached data if available
    this._manager.add('request:skipFetch', this._returnCached.bind(this), 10, 'cache:return');
    // Store parsed data after core parser
    this._manager.add('request:formatData', this._storeCache.bind(this), 999, 'cache:store');
  }

  _returnCached(skipValue, hookContext) {
    const {context} = hookContext;
    if (context._cacheHit) {
      return context._cachedData;
    }
    return skipValue;
  }

  _getStorage(config) {
    if (this._storage) {
      return this._storage;
    }

    const storageType = config.cache.storage;

    if (storageType === 'memory') {
      this._storage = new MemoryStorage(config.cache.maxSize);
    } else if (typeof storageType === 'object') {
      // Custom storage adapter
      this._storage = storageType;
    } else {
      throw new Error(`Unsupported cache storage type: ${storageType}`);
    }

    return this._storage;
  }

  _shouldCache(config) {
    return config.cache.enable === true;
  }

  _generateCacheKey(config) {
    const customKeyGen = config.cache.keyGenerator;
    if (typeof customKeyGen === 'function') {
      return customKeyGen(config);
    }

    // Default key: method:url:params
    // Note: config may have full merged config or partial from _storeCache
    const method = config.method || 'GET';
    const url = config.url || '';
    const params = config.params;
    const paramsStr = params ? JSON.stringify(params) : '';
    return `${method}:${url}:${paramsStr}`;
  }

  _checkCache({url, options, config, context}) {
    if (!this._shouldCache(config)) {
      return;
    }

    // Only cache GET requests by default
    if (options.method !== 'GET') {
      return;
    }

    // Generate key with url/method from hook context
    const key = this._generateCacheKey({...config, url, method: options.method});
    const storage = this._getStorage(config);
    const cached = storage.get(key);

    if (cached && !this._isExpired(cached)) {
      // Mark as cache hit and store data for skipFetch hook
      context._cacheHit = true;
      context._cachedData = cached.data;
    }
  }

  async _storeCache(data, hookContext) {
    const {config, context} = hookContext;

    // Do not store if served from cache
    if (context._cacheHit) {
      return data;
    }

    if (!this._shouldCache(config)) {
      return data;
    }

    // Only cache GET requests by default
    if (config.method !== 'GET') {
      return data;
    }

    // Check if we should cache this response using the original response status
    const shouldCacheCallback = config.cache.shouldCache;
    const response = context._response;
    if (typeof shouldCacheCallback === 'function') {
      if (!shouldCacheCallback(response)) {
        return data;
      }
    } else {
      // Default: only cache successful responses
      if (!response || !response.ok) {
        return data;
      }
    }

    const key = this._generateCacheKey(config);

    const storage = this._getStorage(config);
    const ttl = typeof config.cache === 'object' ? config.cache.ttl : config.cache.ttl;

    storage.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || 60000,
    });

    return data;
  }

  _invalidateCache({url, options, config}) {
    // Invalidate cache on mutating requests
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(options.method)) {
      return;
    }

    const storage = this._getStorage(config);

    // Invalidate all cache entries that match the base URL
    const baseUrl = this._extractBaseUrl(url);
    storage.invalidateByPattern(`GET:${baseUrl}`);
  }

  _extractBaseUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  _isExpired(cached) {
    return Date.now() - cached.timestamp > cached.ttl;
  }

  // No longer cloning Response; we cache parsed data instead
}

/**
 * Simple in-memory LRU cache storage
 */
class MemoryStorage {
  constructor(maxSize = 100) {
    this._cache = new Map();
    this._maxSize = maxSize;
  }

  get(key) {
    if (!this._cache.has(key)) {
      return null;
    }

    // Move to end (LRU)
    const value = this._cache.get(key);
    this._cache.delete(key);
    this._cache.set(key, value);

    return value;
  }

  set(key, value) {
    // Delete if exists (for LRU reordering)
    if (this._cache.has(key)) {
      this._cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this._cache.size >= this._maxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }

    this._cache.set(key, value);
  }

  invalidateByPattern(pattern) {
    const keysToDelete = [];
    for (const key of this._cache.keys()) {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this._cache.delete(key));
  }

  clear() {
    this._cache.clear();
  }

  get size() {
    return this._cache.size;
  }
}
