# Technical Specification: ApiClient (Hooks-based)

A modern, framework-agnostic HTTP client with a clean API and a WordPress-like hooks system (filters/actions). Core concerns (defaults, retries, cancelKey, logging) are implemented as interceptors outside the client, keeping ApiClient focused on orchestrating a request.

---

## Modules

- src/client/ApiClient.js — Public class; request methods; orchestrates the hook pipeline; returns ApiRequest handles.
- src/client/ApiRequest.js — Thenable request handle with abort().
- src/client/internals/InterceptorManager.js — Hooks engine: addFilter/applyFilters, addAction/doAction, add(class|object).
- src/client/interceptors/
  - CoreInterceptor.js — Applies default_config and registers built-ins on client_init.
  - LoggerInterceptor.js — Logs when client.config.debug is true.
  - RetryInterceptor.js — Retries via error filter, using retry config.
  - CancelKeyInterceptor.js — Auto-aborts previous request sharing cancelKey.
  - BaseInterceptor.js — Minimal base class (exposes this.hooks and this.client).
- src/client/internals/requestBuilder.js — Build fetch URL/options; JSON vs FormData; merge headers.
- src/client/internals/responseParser.js — Parse responses; onStatus; autoFixJson; throws ApiError.
- src/core/ApiError.js — Error with config/response/status.
- src/utils/ — serializeParams, mergeHeaders, parser helpers.

---

## ApiClient API

new ApiClient(config)
- baseURL?: string
- headers?: Record<string,string>
- timeout?: number (ms)
- debug?: boolean
- retry?: { attempts?: number, on?: Array<number|'network-error'>, delay?: (attempt: number) => number }

request methods (return ApiRequest, thenable + abort())
- get(url, options?)
- post(url, body, options?)
- put(url, body, options?)
- patch(url, body, options?)
- delete(url, options?)
- request(shorthand, ...args) // e.g. 'post:users/1'

hooks convenience
- addFilter(hookName, name, callback, priority?) / removeFilter(hookName, name)
- addAction(hookName, name, callback, priority?) / removeAction(hookName, name)
- configureInterceptor(name, InterceptorClassOrObject)

---

## Hook names (selected)

- client_init (action): fired in constructor; Core applies defaults and registers built-ins here
- default_config (filter): initial defaults for client.config
- config (filter): per-request config after merge
- headers (filter): final header map
- shorthand (filter): override parseShorthandUrl result
- request_setup (action): pre-dispatch; cancelKey uses this
- request (filter): last chance to mutate request config (signal already attached)
- before_fetch (filter): mutate fetch init (URL/options)
- fetch_response (filter): mutate raw Response
- after_parse (filter): mutate parsed data
- success (filter): transform final data
- error (filter): inspect/replace errors; RetryInterceptor uses this to retry
- final (action): always fires (success or error)
- retry_try (action): emitted by RetryInterceptor before each retry

---

## Request pipeline (order)

1) client_init (constructor)
2) default_config (applied once via Core)
3) When calling get/post/.../request:
   - Merge instance + request headers
   - applyFilters('config', cfg)
   - applyFilters('headers', cfg.headers)
   - doAction('request_setup', { config })
   - applyFilters('request', cfgWithSignal)
   - buildRequestConfig -> fetch init
   - applyFilters('before_fetch', init)
   - fetch(finalUrl, options)
   - applyFilters('fetch_response', response)
   - parseResponse(response, cfg)
   - applyFilters('after_parse', data)
   - applyFilters('success', data)
   - doAction('final', { ok: true, data })
   - On error: distinguish manual vs timeout; map timeout to ApiError; applyFilters('error', error); doAction('final', { ok: false, error }); if filter returns a value, resolve with it (e.g., retry)

---

## Abort semantics

- Every request has its own AbortController.
- Manual abort: call request.abort(). Rethrows AbortError unchanged and does not affect other requests.
- Timeout: controller.abort('timeout') -> mapped to ApiError("Request timed out after Xms").
- cancelKey: managed by CancelKeyInterceptor; aborts prior in-flight request sharing the key; manual abort does not trigger cancelKey cascade.

---

## Built-in interceptors

- CoreInterceptor
  - default_config: fills { debug: false, headers: {}, retry: { attempts:0, on:[503,'network-error'], delay:()=>0 } }
  - client_init: registers LoggerInterceptor, RetryInterceptor, CancelKeyInterceptor
- LoggerInterceptor
  - Logs request and final result when debug=true
- RetryInterceptor
  - Reads cfg.retry; on error, decides based on status/network conditions; emits retry_try; delays via retry.delay; re-dispatches request via client._dispatchRequest
- CancelKeyInterceptor
  - On request_setup, aborts previous controller for same cancelKey; cleans up on final

---

## Usage examples

Basic GET
```js path=null start=null
const api = new ApiClient({ baseURL: 'https://api.example.com' })
const users = await api.get('/users')
```

Add a header via filter
```js path=null start=null
api.addFilter('headers', 'auth', (headers) => ({ ...headers, authorization: 'Bearer TOKEN' }))
await api.get('/me')
```

Retries with backoff
```js path=null start=null
const api = new ApiClient({ retry: { attempts: 2, on: [503, 'network-error'], delay: a => 500 * a } })
await api.get('/flaky')
```

cancelKey to drop stale queries
```js path=null start=null
api.get('/search?q=a', { cancelKey: 'search' })
api.get('/search?q=ab', { cancelKey: 'search' }) // first one auto-aborted
```

Manual abort via handle
```js path=null start=null
const req = api.post('/jobs')
setTimeout(() => req.abort(), 500)
await req
```

Custom shorthand
```js path=null start=null
api.addFilter('shorthand', 'prefix', (parsed) => parsed.method === 'get' ? { ...parsed, url: `/v1${parsed.url}` } : parsed)
```

---

## Notes

- transformResponse is superseded by after_parse/success filters.
- Users can register interceptors via classes (with register) or plain objects using configureInterceptor(name, def) or low-level addFilter/addAction.
- No legacy options; retry grouped under retry.

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
