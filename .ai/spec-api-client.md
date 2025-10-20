# ApiClient - AI Technical Spec

Modern, interceptor-based HTTP client built on a hook system. Core features implemented as interceptors for modularity.

## Architecture

```
ApiClient → creates → ApiRequest → uses → InterceptorManager → executes → Interceptors
```

**Key Files:**
- `src/client/ApiClient.js` - Public API, request factory (get/post/put/patch/delete/request)
- `src/client/ApiRequest.js` - Request executor with lifecycle hooks; context is instance-level (persists across send() calls)
- `src/client/ApiError.js` - Error with config/response/status
- `src/client/lib/InterceptorManager.js` - Hook engine with priority-based execution
- `src/client/interceptors/BaseInterceptor.js` - Base for all interceptors
- `src/client/lib/ConfigManager.js` - Config lifecycle: default → client → request → merge → prepare
- `src/client/lib/requestBuilder.js` - Builds fetch URL/options; handles FormData/JSON
- `src/client/lib/responseParser.js` - Parses responses with autoFixJson; throws ApiError on failures

---

## Core API

**Constructor:**
```js
new ApiClient({
  baseURL?: string,
  headers?: Record<string, string>,
  body?: Record<string, any>,  // Plain object only, no FormData
  timeout?: number,
  debug?: { enable: boolean, scope?: string | string[] | '*' } | boolean,
  autoFixJson?: boolean,  // Default: true
  onStatus?: Record<number, (response) => any>,
  interceptors?: Array<Class | string>  // Custom or '-name' to remove
})
```

**Request Methods:**
```js
client.get(url, options?)
client.post(url, body?, options?)
client.put(url, body?, options?)
client.patch(url, body?, options?)
client.delete(url, options?)
client.request('METHOD:/path', body?, options?)  // Shorthand
```

**Per-Request Options:**
- `headers`, `params`, `baseURL`, `timeout`, `autoFixJson`, `onStatus`
- `cancelKey: string` - Auto-cancels previous request with same key (last-one-wins)

**Interceptor Control:**
```js
client.interceptors.attach(InterceptorClass)
client.interceptors.detach(name)
client.interceptors.add(hookName, name, callback, priority)
client.interceptors.remove(hookName, name)
```

---

## Request Lifecycle & Hooks

**Execution Order:**
1. `request:init` - Early setup (e.g., cancelKey)
2. `request:defaultConfig` - Add interceptor defaults
3. `request:clientConfig` - Normalize client config (boolean shorthand)
4. `request:requestConfig` - Normalize request config
5. ConfigManager.prepare() - Deep merge (defaults < client < request)
6. `request:prepareConfig` - Final adjustments
7. buildRequestConfig() - Build fetch URL/options
8. `request:beforeRequest` - Pre-fetch notification
9. `request:skipFetch` - Return value to skip fetch (cache hit)
10. `request:performFetch` - Wrap/override fetch (retry logic)
11. fetch()
12. `request:formatResponse` - Transform Response object (status handlers)
13. `request:onResponse` - Observe response (non-transforming)
14. `request:formatData` - Parse/transform data
15. `request:formatError` - Transform errors
16. `request:onError` - Observe errors (non-transforming)
17. `request:suppressError` - Return true to suppress
18. `request:complete` - Always runs (finally)

**Hook Context:**
```js
{
  client: ApiClient,
  config: Object,
  context: Object,  // Instance-level, persists across send() calls
  request: ApiRequest,
  url: string,
  options: Object,
  error: Error
}
```

---

## Built-in Interceptors

**CoreInterceptor** (always attached):
- Registers all built-ins: Logger, StatusHandler, CancelKey, Cache, Metrics, RateLimit, Retry
- Sets `autoFixJson: true`, `Accept: application/json` defaults
- Wires response parsing via `request:formatData`

**LoggerInterceptor** (priority 900+):
- Logs when `debug.enable === true`
- Respects `debug.scope` filter
- Boolean shorthand: `debug: true`

**StatusHandlerInterceptor** (priority 50):
- Executes `onStatus` callbacks at `request:formatResponse`
- Allows early returns (e.g., 304 cache)

**CancelKeyInterceptor** (priority 1, 999):
- Auto-aborts previous requests with same `cancelKey` (last-one-wins)
- Hooks: `request:init`, `request:complete`

**CacheInterceptor** (priority 10-999):
- Caches GET with TTL, auto-invalidates on mutations
- Config: `{ enable, ttl, invalidateOn }`
- Boolean shorthand: `cache: true`

**RetryInterceptor** (priority 50):
- Retries on status codes or network errors with backoff
- Config: `{ enable, maxAttempts, methods, retryOn, backoff: { type, base, jitter } }`
- Hook: `request:performFetch`

**RateLimitInterceptor** (priority 30):
- Token-bucket queue with sliding/fixed window
- Config: `{ enable, maxRequests, window, strategy, scope, onRateLimit }`
- Scope: `global` or `per-endpoint` (origin+pathname)

**MetricsInterceptor** (priority 100):
- Tracks duration, size, status
- Boolean shorthand: `metrics: true`

---

## Creating Interceptors

```js
class CustomInterceptor extends BaseInterceptor {
  static name = 'custom';  // Required
  static defaultConfig = { enable: false, option: 'value' };  // Optional
  configKey = 'custom';  // Required
  
  register() {
    this._useShorthandConfig('custom');  // Enable boolean shorthand
    this._manager.add('request:beforeRequest', 'custom:hook', this._method.bind(this), priority);
  }
  
  _method(context) { /* ... */ }
}
```

**Helpers:**
- `_useShorthandConfig(key)` - Auto-registers boolean shorthand hooks
- `_getDefaultConfig()` - Returns defaults
- `_normalizeConfig(config, key)` - Normalizes boolean shorthand

---

## Key Behaviors

**Config Merge:**
- Deep merge: defaults < client < request
- Headers merge (set to `undefined` to remove)
- Body at client-level must be plain object (FormData throws)
- Boolean shorthand: `cache: true` → `cache: { enable: true, ...defaults }`

**Request Control:**
- Each request has AbortController
- `request.abort(reason)` cancels request
- `cancelKey` cancels previous request with same key (last-one-wins)

**File Uploads:**
- Auto-detects React Native file objects `{ uri, name, type }`
- Creates FormData automatically

**Error Handling:**
- Throws ApiError with `{ message, status, config, response }`
- `onStatus` handlers can return early or throw custom errors
- `request:suppressError` can prevent throwing

**Testing:**
- 337 tests passing across all modules
- Framework: Jest

---

## Design Principles

1. Minimal core - features as interceptors
2. Explicit config, no magic
3. Priority-based hooks
4. Framework agnostic
5. Early validation (FormData at client-level throws)
6. Context persists across send() calls

---

*For usage examples and migration guides, see `.ai/docs/api-client.md`*
