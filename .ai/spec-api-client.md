# Technical Specification: ApiClient

A modern, framework-agnostic HTTP client with a clean API and robust primitives (interceptors, retries, timeouts, cancellation, uploads). It powers higher layers but has no React dependency.

---

## Modules

- src/client/ApiClient.js — Public class (get/post/put/patch/delete/request). Orchestrates retries, timeouts, and interceptors.
- src/client/internals/InterceptorManager.js — Adds/removes/runs interceptors in priority order; pipeline semantics (undefined return preserves prior value).
- src/client/internals/requestBuilder.js — Builds final fetch URL/options; merges headers; auto-creates FormData when files present.
- src/client/internals/responseParser.js — Parses responses, supports onStatus handlers, autoFixJson, throws ApiError on failure.
- src/core/ApiError.js — Standard error with config/response/status.
- src/utils/ — serializeParams, mergeHeaders, parser helpers.

---

## ApiClient API

new ApiClient(config)
- baseURL?: string
- headers?: Record<string,string>
- timeout?: number (ms)
- logLevel?: 'none' | 'debug'
- retries?: number (default 0)
- retryDelay?: (attempt: number) => number
- retryOn?: Array<number | 'network-error'> (default [503, 'network-error'])
- autoFixJson?: boolean

request methods
- get(url, options?)
- post(url, body, options?)
- put(url, body, options?)
- patch(url, body, options?)
- delete(url, options?)
- request(shorthand, ...args) // e.g. 'post:users/1'

interceptors
- configureInterceptor(shorthand, callbacks)
  - '+name@priority' to add
  - '-name' to remove

Per-request options
- headers?: Record<string,string>
- params?: object
- timeout?: number
- cancelKey?: string | symbol
- onStatus?: Record<number,(res: Response)=>any>
- transformResponse?: (data:any)=>any
- retries/retryDelay/retryOn/autoFixJson?: override instance
- _bypassOffline?: boolean (internal)

---

## Behavior Details

- Retries: _request loops up to retries, only for retryOn matches (status via ApiError.status or 'network-error' when fetch rejects without response). Uses retryDelay(attempt) between tries.
- Timeouts: _setupAttempt creates AbortController and a timer; when fired, controller.abort('timeout'). _performFetch catches AbortError with reason 'timeout' and throws ApiError('Request timed out after Xms').
- cancelKey: starting a request with the same cancelKey aborts the previous one; the previous promise rejects with the original AbortError.
- Interceptors: onRequest -> fetch -> parseResponse -> optional transformResponse -> onSuccess. onError runs once after retries are exhausted to transform/observe the final error.
- Uploads: requestBuilder turns bodies with file-like objects into FormData and does not set content-type explicitly.

---

## Usage Examples

Basic GET
```js path=null start=null
const api = new ApiClient({ baseURL: 'https://api.example.com' });
const users = await api.get('/users');
```

POST with JSON
```js path=null start=null
await api.post('/todos', { title: 'Ship it' });
```

Timeout per request
```js path=null start=null
await api.get('/slow', { timeout: 5000 });
```

Retries with backoff
```js path=null start=null
const api = new ApiClient({ retries: 2, retryDelay: (a) => 500 * a, retryOn: [503, 'network-error'] });
const data = await api.get('/flaky');
```

cancelKey to drop stale requests
```js path=null start=null
api.get('/search?q=a', { cancelKey: 'search' });
api.get('/search?q=ab', { cancelKey: 'search' }); // aborts the previous
```

Interceptors
```js path=null start=null
api.configureInterceptor('+auth@5', {
  onRequest: (cfg) => ({ ...cfg, headers: { ...cfg.headers, authorization: 'Bearer TOKEN' } }),
});
```

onStatus handler
```js path=null start=null
const data = await api.get('/users/1', {
  onStatus: {
    304: () => cachedUser,
  },
});
```

autoFixJson
```js path=null start=null
const api = new ApiClient({ autoFixJson: true });
await api.get('/legacy'); // tolerates leading non-JSON text
```

---

## Testing Strategy (what we cover)

- utils (serializeParams, mergeHeaders, parser) — pure, deterministic
- requestBuilder — URL join, params, JSON vs FormData
- responseParser — success, error, onStatus, autoFixJson
- ApiClient
  - basic (GET/POST, interceptors, transformResponse, shorthand)
  - advanced (logger)
  - timing (new focused files)
    - ApiClient.timeout.test.js — timeout abort path
    - ApiClient.cancelKey.test.js — scoped abort path
    - ApiClient.retry.test.js — status/network retries + delay
