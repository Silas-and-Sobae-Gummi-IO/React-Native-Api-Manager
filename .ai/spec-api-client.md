# Technical Specification: ApiClient

A modern, framework-agnostic HTTP client with a clean interceptor-based architecture. Built on a hook system that allows modular extension of request/response behavior. Core features (logging, cancelKey, status handling, response parsing) are implemented as interceptors, keeping ApiClient focused and composable.

---

## Architecture Overview

```
┌─────────────────┐
│   ApiClient     │  → Creates and configures requests
└────────┬────────┘
         │ creates
         ▼
┌─────────────────┐
│   ApiRequest    │  → Executes single request with lifecycle hooks
└────────┬────────┘
         │ uses
         ▼
┌───────────────────────┐
│ InterceptorManager    │  → Manages hooks and interceptor providers
└───────────────────────┘
         │ executes
         ▼
┌───────────────────────┐
│   Interceptors        │  → Core, Logger, StatusHandler, CancelKey
└───────────────────────┘
```

---

## Core Modules

### Client Layer
- **src/client/ApiClient.js** — Public API; request factory methods (get/post/put/patch/delete/request)
- **src/client/ApiRequest.js** — Request handle with send(), abort(); orchestrates hook lifecycle
  - Context is instance-level: initialized in constructor, persists across multiple send() calls
- **src/client/ApiError.js** — Standard error with config/response/status properties

### Interceptor System
- **src/client/lib/InterceptorManager.js** — Hook engine: add/remove/attach/detach; priority-based execution
- **src/client/interceptors/BaseInterceptor.js** — Base class for all interceptors
- **src/client/interceptors/CoreInterceptor.js** — Registers built-in interceptors; sets defaults
- **src/client/interceptors/LoggerInterceptor.js** — Debug logging when enabled
- **src/client/interceptors/StatusHandlerInterceptor.js** — Handles onStatus callbacks
- **src/client/interceptors/CancelKeyInterceptor.js** — Auto-cancels duplicate requests

### Internal Utilities
- **src/client/lib/ConfigManager.js** — Manages config lifecycle: defaultConfig → clientConfig → requestConfig → deep merge → prepareConfig
- **src/client/lib/requestBuilder.js** — Builds fetch URL/options from final config; handles FormData/JSON
- **src/client/lib/responseParser.js** — Parses responses; autoFixJson; throws ApiError on failures
- **src/utils/** — serializeParams, mergeHeaders, parser helpers

---

## ApiClient API

### Constructor
```js path=null start=null
new ApiClient(config?)
```

**Config Options:**
- `baseURL?: string` — Base URL for relative paths
- `headers?: Record<string, string>` — Default headers for all requests
- `body?: Record<string, any>` — Default body properties for all requests (plain object only, no FormData)
- `timeout?: number` — Request timeout in milliseconds
- `debug?: { enable: boolean, scope?: string | string[] | '*' }` — Debug logging config
- `autoFixJson?: boolean` — Auto-fix malformed JSON responses (default: true)
- `onStatus?: Record<number, (response) => any>` — Global status code handlers
- `interceptors?: Array<Class | string>` — Custom interceptors or removal syntax ('-name')

### Request Methods
All methods return an `ApiRequest` instance (thenable + abort()).

```js path=null start=null
client.get(url, options?)
client.post(url, body?, options?)
client.put(url, body?, options?)
client.patch(url, body?, options?)
client.delete(url, options?)
client.request(shorthand, ...args)  // e.g., 'POST:/users' or 'GET:/users?page=1'
```

**Per-Request Options:**
- `headers?: Record<string, string>` — Additional/override headers
- `params?: Record<string, any>` — Query parameters
- `baseURL?: string` — Override client baseURL
- `timeout?: number` — Override timeout
- `cancelKey?: string` — Cancel previous request with same key
- `onStatus?: Record<number, (response) => any>` — Per-request status handlers
- `autoFixJson?: boolean` — Override autoFixJson setting

### Interceptor Management
```js path=null start=null
client.interceptors.attach(InterceptorClass)
client.interceptors.detach(name)
client.interceptors.add(hookName, name, callback, priority)
client.interceptors.remove(hookName, name)
```

---

## ApiRequest Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    request.send()                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  request:init          │  Early initialization hook
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  request:defaultConfig │  Interceptors add their defaults (empty object input)
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  request:clientConfig  │  Normalize client config (boolean shorthand, etc.)
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │ request:requestConfig  │  Normalize request config
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  ConfigManager.prepare │  Deep merge configs (defaults < client < request)
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  request:prepareConfig │  Final adjustments to merged config
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  buildRequestConfig()  │  Build fetch URL and options
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  request:beforeRequest │  Pre-fetch hook (logging, etc.)
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │      fetch()           │  Actual HTTP request
        └────────┬───────────────┘
                 │
            ┌────┴────┐
         success?   error?
            │          │
            ▼          ▼
   ┌─────────────┐  ┌──────────────┐
   │formatResponse│  │formatError   │
   └──────┬──────┘  └──────┬───────┘
          │                │
          ▼                ▼
   ┌─────────────┐  ┌──────────────┐
   │onResponse   │  │onError       │
   └──────┬──────┘  └──────┬───────┘
          │                │
          ▼                ▼
   ┌─────────────┐  ┌──────────────┐
   │formatData   │  │suppressError │
   └──────┬──────┘  └──────┬───────┘
          │                │
          └────────┬───────┘
                   ▼
          ┌────────────────┐
          │request:complete│  Always runs (finally)
          └────────────────┘
```

---

## Hook System

### Hook Names and Purpose

**Lifecycle Hooks:**
- `client:init` — Fired in ApiClient constructor; Core attaches built-ins here
- `request:init` — Early initialization hook before config processing (for setup tasks like cancelKey)
- `request:defaultConfig` — Interceptors add default config values (receives empty object, runs before normalization)
- `request:clientConfig` — Normalize client config (e.g., boolean shorthand: `cache: true` → `cache: {enable: true}`)
- `request:requestConfig` — Normalize request config (same as clientConfig but for per-request config)
- `request:prepareConfig` — Final adjustments to merged config (runs after merge, before buildRequestConfig)
- `request:beforeRequest` — Pre-fetch notification (receives {url, options})
- `request:skipFetch` — Return non-null value to skip fetch and return early (e.g., cache hit)
- `request:formatResponse` — Transform raw Response object after fetch
- `request:onResponse` — Observe/log response (non-transforming)
- `request:formatData` — Parse and transform response data
- `request:formatError` — Transform errors before throwing
- `request:onError` — Observe/log errors (non-transforming)
- `request:suppressError` — Return true to suppress error throwing
- `request:complete` — Always runs in finally block

**Hook Signatures:**
```js path=null start=null
// Value hooks (transform data)
callback(value, context) => newValue

// Notification hooks (no value)
callback(context) => void

// Context object contains:
{
  client: ApiClient,     // Client instance
  config: Object,        // Request config
  context: Object,       // Instance-level context (persists across send() calls)
  request: ApiRequest,   // Request instance (in some hooks)
  url: string,          // Final URL (in beforeRequest)
  options: Object,      // Fetch options (in beforeRequest)
  error: Error,         // Error object (in suppressError)
}
```

---

## Interceptors

### BaseInterceptor
All interceptors extend this base class:

```js path=null start=null
class CustomInterceptor extends BaseInterceptor {
  static name = 'custom';  // Required: unique identifier
  static defaultConfig = {   // Optional: default config for this interceptor
    enable: false,
    customOption: 'value',
  };
  
  configKey = 'custom';  // Config key in client/request config (required)
  
  register() {
    // Use helper for boolean shorthand pattern (must pass configKey explicitly)
    this._useShorthandConfig('custom');
    
    // Add other hooks
    this._manager.add('request:beforeRequest', 'custom:log', this._log.bind(this), 10);
  }
  
  _log(context) {
    console.log('Request:', context.url);
  }
}
```

**BaseInterceptor Helpers:**
- `_useShorthandConfig(key)` — Auto-registers hooks for boolean shorthand (e.g., `cache: true` → `cache: {enable: true, ...defaults}`)
- `_getDefaultConfig()` — Returns default config (from `static defaultConfig` or override this method)
- `_normalizeConfig(config, key)` — Normalizes config value (handles boolean shorthand and merges with defaults)

### Built-in Interceptors

**CoreInterceptor** (always attached)
- Registers: LoggerInterceptor, StatusHandlerInterceptor, CancelKeyInterceptor, CacheInterceptor, MetricsInterceptor, RateLimitInterceptor
- Sets defaults via `request:defaultConfig`: `autoFixJson: true`, `Accept: application/json` header
- Wires response parsing via `request:formatData` hook

**LoggerInterceptor** (priority 900+)
- Logs request/response when `debug.enable === true`
- Respects `debug.scope` for filtered logging
- Uses `_useShorthandConfig('debug')` for boolean shorthand support
- Hooks: `request:beforeRequest`, `request:onResponse`

**StatusHandlerInterceptor** (priority 50)
- Executes `onStatus` callbacks before response parsing
- Allows early returns for specific status codes (e.g., 304 Not Modified)
- Hook: `request:formatResponse`

**CacheInterceptor** (priority 10-999)
- Caches GET requests with TTL and automatic invalidation
- Supports boolean shorthand: `cache: true` → `cache: {enable: true, ...defaults}`
- Uses `_useShorthandConfig()` for config normalization
- Hooks: `request:beforeRequest` (check cache, invalidate), `request:skipFetch` (return cached), `request:formatData` (store)

**MetricsInterceptor** (priority 100)
- Tracks request metrics: duration, timestamps, size, status
- Supports boolean shorthand: `metrics: true` → `metrics: {enable: true, ...defaults}`
- Uses `_useShorthandConfig()` for config normalization
- Hooks: `request:beforeRequest`, `request:complete`

**RateLimitInterceptor** (priority 30)
- Limits outgoing requests using a token-bucket-like queue
- Supports boolean shorthand: `rateLimit: true` → `rateLimit: {enable: true, ...defaults}`
- Uses `_useShorthandConfig()` for config normalization
- Hooks: `request:beforeRequest` (acquire slot and queue if needed)

  Config (defaults shown):
  - `enable: false` — Turn on/off
  - `maxRequests: 10` — Allowed requests per window
  - `window: 1000` — Window size in ms
  - `strategy: 'sliding' | 'fixed'` —
    - `sliding`: rolling window; we allow up to `maxRequests` in the last `window` ms (new requests are allowed as the oldest timestamp exits the window)
    - `fixed`: fixed buckets; count resets at each exact `window` boundary
  - `scope: 'global' | 'per-endpoint'` —
    - `global`: single shared bucket for all requests
    - `per-endpoint`: one bucket per base URL path (query params ignored)
  - `onRateLimit?: (waitTimeMs:number) => void` — Optional callback when requests are queued; receives computed wait time

  Notes:
  - Per-request overrides are supported.
  - Endpoints are derived from URL origin+pathname; invalid URLs fall back to raw string.

**CancelKeyInterceptor** (priority 1 setup, 999 cleanup)
- Auto-aborts previous request with same `cancelKey` (last-one-wins strategy)
- Latest request with the same key cancels all previous pending requests
- Cleans up map after request completes
- Hooks: `request:init`, `request:complete`

---

## Request Abortion

Each request has its own `AbortController`:

```js path=null start=null
const request = client.get('/slow-endpoint');
setTimeout(() => request.abort('user-cancelled'), 1000);

try {
  await request.send();
} catch (error) {
  // DOMException: Aborted
}
```

**CancelKey usage (Last-One-Wins):**
```js path=null start=null
// Search autocomplete - only latest request executes
client.get('/search', { cancelKey: 'search', params: { q: 'a' } });
client.get('/search', { cancelKey: 'search', params: { q: 'ab' } });  // Cancels first
client.get('/search', { cancelKey: 'search', params: { q: 'abc' } }); // Cancels second

// When 5 requests fire simultaneously:
for (let i = 1; i <= 5; i++) {
  client.get('/api', { cancelKey: 'same-key' }).send();
}
// Requests 1-4 get aborted, only request 5 completes
// (NOT first-one-wins - the LATEST request wins)
```

---

## Usage Examples

### Basic GET
```js path=null start=null
const client = new ApiClient({ baseURL: 'https://api.example.com' });
const users = await client.get('/users').send();
```

### POST with JSON
```js path=null start=null
const newUser = await client.post('/users', { 
  name: 'John',
  email: 'john@example.com' 
}).send();
```

### Query Parameters
```js path=null start=null
const results = await client.get('/search', {
  params: { q: 'react', page: 1, limit: 20 }
}).send();
```

### Headers Override
```js path=null start=null
const client = new ApiClient({ 
  headers: { authorization: 'Bearer token' } 
});

const data = await client.get('/protected', {
  headers: { 'x-custom-header': 'value' }
}).send();
```

### Body Override at Send Time
```js path=null start=null
const request = client.post('/users', { name: 'Initial' });

// Override body properties
await request.send({ name: 'Updated', email: 'new@example.com' });
```

### Client-Level Body
```js path=null start=null
// Useful for adding default properties to all requests
const client = new ApiClient({
  body: { is_super_admin: true }
});

await client.post('/users', { name: 'John' }).send();
// Sends: { is_super_admin: true, name: 'John' }
```

### FormData Upload
```js path=null start=null
// Auto-detects React Native file objects and creates FormData
const file = { uri: 'file:///image.jpg', name: 'photo.jpg', type: 'image/jpeg' };
await client.post('/upload', { 
  userId: 123,
  photo: file 
}).send();
```

### Status Handlers
```js path=null start=null
const user = await client.get('/users/1', {
  onStatus: {
    304: () => getCachedUser(1),
    404: () => null,
  }
}).send();
```

### Debug Logging
```js path=null start=null
const client = new ApiClient({
  debug: { enable: true, scope: '*' }
});

await client.get('/users').send();
// Logs: [API beforeFetch] GET -> https://api.example.com/users
// Logs: [API Response] success {...}
```

### Custom Interceptor
```js path=null start=null
class AuthInterceptor extends BaseInterceptor {
  static name = 'auth';
  
  register() {
    this._manager.add('request:options', 'auth:token', this._addAuth.bind(this), 5);
  }
  
  _addAuth(config) {
    return {
      ...config,
      headers: {
        ...config.headers,
        authorization: `Bearer ${this._getToken()}`
      }
    };
  }
  
  _getToken() {
    return localStorage.getItem('token');
  }
}

const client = new ApiClient({
  baseURL: 'https://api.example.com',
  interceptors: [AuthInterceptor]
});
```

### Remove Built-in Interceptor
```js path=null start=null
// Disable logging
const client = new ApiClient({
  interceptors: ['-logger']
});
```

### Shorthand URL Syntax
```js path=null start=null
await client.request('POST:/users', { name: 'John' });
await client.request('GET:/users?page=1');
```

---

## Error Handling

### ApiError Structure
```js path=null start=null
try {
  await client.get('/not-found').send();
} catch (error) {
  console.log(error.message);  // "Request failed with status code 404"
  console.log(error.status);   // 404
  console.log(error.config);   // Request config
  console.log(error.response); // { data, status }
}
```

### Suppress Errors
```js path=null start=null
class SuppressInterceptor extends BaseInterceptor {
  static name = 'suppress';
  
  register() {
    this._manager.add('request:suppressError', 'suppress:404', (shouldSuppress, ctx) => {
      return ctx.error.status === 404;
    });
  }
}

const client = new ApiClient({
  interceptors: [SuppressInterceptor]
});

const result = await client.get('/maybe-exists').send();
// Returns undefined instead of throwing on 404
```

---

## Testing

All core modules are fully tested:

- **ApiClient.test.js** (40 tests) — HTTP methods, config merging, interceptor registration, body validation
- **ApiClient.expert.test.js** (5 tests) — Advanced scenarios, custom interceptors
- **ApiRequest.test.js** (30 tests) — Lifecycle, hooks, error handling, context persistence
- **InterceptorManager.test.js** (45 tests) — Hook management, priority, attach/detach
- **LoggerInterceptor.test.js** (14 tests) — Debug logging, scope filtering
- **CancelKeyInterceptor.test.js** (17 tests) — Cancellation, cleanup, edge cases
- **StatusHandlerInterceptor.test.js** (8 tests) — Status handlers, early returns
- **CoreInterceptor.test.js** (10 tests) — Defaults, built-in registration
- **responseParser.test.js** (19 tests) — JSON parsing, autoFixJson, error handling
- **requestBuilder.test.js** (8 tests) — URL building, params, FormData
- **ApiError.test.js** (2 tests) — Error structure

**Total: 306 tests passing** (includes Agent and Cache tests)

---

## Future Enhancements

### Not Yet Implemented (Good to Have)

**RetryInterceptor**
- Automatic retry for failed requests
- Challenge: Current architecture doesn't support restarting request lifecycle from within error hooks
- Possible solutions:
  - Implement at ApiClient level as wrapper
  - Move to ApiAgent layer (where conditional retry already exists)
  - Rethink interceptor lifecycle to support restarts

**Additional Features:**
- Request/response transformation pipelines
- Request deduplication (beyond cancelKey)
- Request caching layer
- Progress tracking for uploads/downloads
- Request metrics and timing
- Circuit breaker pattern

---

## Design Principles

1. **Separation of Concerns** — Core client is minimal; features are interceptors
2. **Composability** — Mix and match interceptors as needed
3. **Type Safety Ready** — Structure supports TypeScript definitions
4. **No Magic** — Explicit config, predictable behavior
5. **Testing First** — All features are thoroughly tested
6. **Performance** — Minimal overhead; hooks only run when registered
7. **Framework Agnostic** — No React/framework dependencies in core
8. **Early Validation** — Invalid configs throw errors at construction time (e.g., FormData at client level)

---

## Migration Notes

### From v1 (Old Hook Names)
- `client_init` → `client:init`
- `default_config` → `request:defaultConfig`
- `before_fetch` → `request:beforeRequest`
- `fetch_response` → `request:formatResponse`
- `after_parse` → `request:formatData`
- `success` → Use `request:formatData` or `request:onResponse`
- `error` → `request:formatError` or `request:onError`
- `final` → `request:complete`

### From Basic Fetch
```js path=null start=null
// Before
const response = await fetch('https://api.example.com/users');
const data = await response.json();

// After
const client = new ApiClient({ baseURL: 'https://api.example.com' });
const data = await client.get('/users').send();
```

---

## Performance Characteristics

- **Hook Overhead:** ~0.1ms per hook with no callbacks registered
- **Interceptor Registration:** One-time cost at client creation
- **Memory:** Each request creates new AbortController and context
- **Cleanup:** Automatic via `request:complete` hook (finally block)

---

## Browser/Environment Support

- **Modern Browsers:** All evergreen browsers
- **React Native:** Full support including file uploads
- **Node.js:** Requires `fetch` polyfill (e.g., `node-fetch`, `undici`)
- **AbortController:** Required (polyfill if targeting older environments)

---

*Last Updated: October 2025 - Based on implementation with 306 passing tests*
