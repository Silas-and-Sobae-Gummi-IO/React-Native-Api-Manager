# ApiClient Documentation

A modern, framework-agnostic HTTP client built on an interceptor-based architecture. Think of it as a modular wrapper around `fetch` that lets you compose request/response behavior through hooks.

## Quick Start

```js path=null start=null
import ApiClient from './src/client/ApiClient';

const client = new ApiClient({ 
  baseURL: 'https://api.example.com',
  headers: { authorization: 'Bearer token123' }
});

const users = await client.get('/users').send();
```

---

## Configuration Options

### Client-Level Config

Applied to all requests made by the client instance:

```js path=null start=null
const client = new ApiClient({
  baseURL: 'https://api.example.com',
  
  // Default headers for all requests
  headers: {
    'authorization': 'Bearer token',
    'x-api-version': 'v2'
  },
  
  // Default body properties (plain object only)
  body: { 
    is_super_admin: true  // Merged with each POST/PUT/PATCH body
  },
  
  // Request timeout in milliseconds
  timeout: 5000,
  
  // Debug logging
  debug: { 
    enable: true, 
    scope: '*'  // Or ['users', 'auth'] to filter
  },
  
  // Auto-fix malformed JSON responses
  autoFixJson: true,
  
  // Global status handlers
  onStatus: {
    401: (response) => redirectToLogin(),
    404: () => null
  },
  
  // Add/remove interceptors
  interceptors: [
    AuthInterceptor,      // Custom interceptor
    '-logger'             // Remove built-in logger
  ]
});
```

### Per-Request Options

Override client config for specific requests:

```js path=null start=null
await client.get('/users', {
  // Add/override headers
  headers: { 'x-custom': 'value' },
  
  // Query parameters
  params: { page: 1, limit: 20 },
  
  // Override baseURL
  baseURL: 'https://other-api.com',
  
  // Override timeout
  timeout: 10000,
  
  // Cancel previous request with same key
  cancelKey: 'search',
  
  // Per-request status handlers
  onStatus: {
    304: () => getCachedData()
  },
  
  // Override autoFixJson
  autoFixJson: false
});
```

---

## Making Requests

### HTTP Methods

```js path=null start=null
// GET
await client.get('/users').send();
await client.get('/users', { params: { page: 1 } }).send();

// POST (with body)
await client.post('/users', { name: 'John', email: 'john@example.com' }).send();

// PUT
await client.put('/users/123', { name: 'Jane' }).send();

// PATCH
await client.patch('/users/123', { email: 'new@example.com' }).send();

// DELETE
await client.delete('/users/123').send();
```

### Shorthand Syntax

```js path=null start=null
// Same as client.post('/users', { name: 'John' }).send()
await client.request('POST:/users', { name: 'John' });

// Same as client.get('/users?page=1').send()
await client.request('GET:/users?page=1');
```

### Query Parameters

```js path=null start=null
// Automatic serialization
await client.get('/search', {
  params: { 
    q: 'react', 
    page: 1, 
    tags: ['js', 'frontend']  // Array handling
  }
}).send();

// Result: /search?q=react&page=1&tags=js&tags=frontend
```

---

## Request Control

### Aborting Requests

```js path=null start=null
const request = client.get('/slow-endpoint');

// Abort after 1 second
setTimeout(() => request.abort('user-cancelled'), 1000);

try {
  await request.send();
} catch (error) {
  // DOMException: Aborted
}
```

### Cancel Keys (Last-One-Wins)

Perfect for search autocomplete or debouncing:

```js path=null start=null
// User types "abc" quickly - only last request completes
client.get('/search', { cancelKey: 'search', params: { q: 'a' } });
client.get('/search', { cancelKey: 'search', params: { q: 'ab' } });  // Cancels first
client.get('/search', { cancelKey: 'search', params: { q: 'abc' } }); // Cancels second

// Latest request wins - requests 1-4 get aborted
for (let i = 1; i <= 5; i++) {
  client.get('/api', { cancelKey: 'same-key' }).send();
}
// Only request #5 completes
```

### Body Override at Send Time

```js path=null start=null
const request = client.post('/users', { name: 'Initial' });

// Override body properties when sending
await request.send({ name: 'Updated', email: 'new@example.com' });
```

---

## File Uploads

### React Native

Auto-detects React Native file objects:

```js path=null start=null
const file = { 
  uri: 'file:///path/to/image.jpg', 
  name: 'photo.jpg', 
  type: 'image/jpeg' 
};

await client.post('/upload', { 
  userId: 123,
  photo: file 
}).send();
```

### Web/Browser

```js path=null start=null
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('userId', '123');

await client.post('/upload', formData).send();
```

---

## Status Handlers

Execute custom logic for specific HTTP status codes:

```js path=null start=null
// Per-request
const user = await client.get('/users/1', {
  onStatus: {
    304: () => getCachedUser(1),      // Not Modified - return cached
    404: () => null,                   // Not Found - return null instead of error
    403: (response) => {               // Forbidden - custom handling
      showPermissionError();
      return null;
    }
  }
}).send();

// Client-level (all requests)
const client = new ApiClient({
  baseURL: 'https://api.example.com',
  onStatus: {
    401: (response) => {
      redirectToLogin();
      throw new Error('Unauthorized');
    }
  }
});
```

---

## Debug Logging

### Enable for All Requests

```js path=null start=null
const client = new ApiClient({
  debug: { enable: true, scope: '*' }
});

await client.get('/users').send();
// Console output:
// [API beforeFetch] GET -> https://api.example.com/users
// [API Response] success { data: [...], status: 200 }
```

### Filtered Logging

```js path=null start=null
const client = new ApiClient({
  debug: { 
    enable: true, 
    scope: ['users', 'auth']  // Only log these endpoints
  }
});
```

### Boolean Shorthand

```js path=null start=null
const client = new ApiClient({
  debug: true  // Same as { enable: true, scope: '*' }
});
```

---

## Error Handling

### ApiError Structure

```js path=null start=null
try {
  await client.get('/not-found').send();
} catch (error) {
  console.log(error.message);   // "Request failed with status code 404"
  console.log(error.status);    // 404
  console.log(error.config);    // Request config object
  console.log(error.response);  // { data, status, headers }
}
```

### Suppress Specific Errors

```js path=null start=null
import { BaseInterceptor } from './src/client/interceptors/BaseInterceptor';

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

## Error Recovery

RecoveryInterceptor handles smart error recovery (e.g., token refresh, device registration) before retrying.

### Auth Token Refresh

```js path=null start=null
const client = new ApiClient({
  baseURL: 'https://api.example.com',
  recovery: {
    auth: {
      // Trigger on 401 errors
      shouldRetry: (error) => error.status === 401,
      
      // Refresh token and retry
      handler: async (error, context) => {
        const newToken = await refreshAuthToken();
        // Update client headers for subsequent requests
        context.client.config.headers.authorization = `Bearer ${newToken}`;
      }
    }
  }
});

// First request gets 401, token refreshes, request retries automatically
const data = await client.get('/protected').send();
```

### Multiple Handlers

```js path=null start=null
const client = new ApiClient({
  recovery: {
    auth: {
      shouldRetry: (error) => error.status === 401,
      handler: async () => await refreshToken()
    },
    device: {
      shouldRetry: (error) => error.status === 403,
      handler: async () => await registerDevice()
    }
  }
});
```

### Handler Failure Behavior

```js path=null start=null
const client = new ApiClient({
  recovery: {
    auth: {
      shouldRetry: (error) => error.status === 401,
      handler: async () => await refreshToken(),
      abortOnFailure: true  // Default: fail paused requests if handler fails
    }
  }
});
```

### Disable Per-Request

```js path=null start=null
// Skip recovery for public endpoints
await client.get('/public', {
  recovery: {
    auth: { enable: false }
  }
}).send();
```

### How It Works

1. Request fails with error
2. `shouldRetry` checks if this handler should run
3. Pause concurrent requests for this client
4. Run `handler` (e.g., refresh token)
5. If handler succeeds → retry original request
6. If handler fails → throw original error
7. Resume paused requests

**Prevents infinite loops:** Each request only attempts recovery once.

---

## Custom Interceptors

Interceptors let you hook into the request/response lifecycle.

### Basic Auth Interceptor

```js path=null start=null
import { BaseInterceptor } from './src/client/interceptors/BaseInterceptor';

class AuthInterceptor extends BaseInterceptor {
  static name = 'auth';
  
  register() {
    this._manager.add(
      'request:prepareConfig', 
      'auth:token', 
      this._addAuth.bind(this), 
      5  // Priority
    );
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

### Configurable Interceptor

```js path=null start=null
class CustomInterceptor extends BaseInterceptor {
  static name = 'custom';
  
  static defaultConfig = {
    enable: false,
    prefix: 'Bearer'
  };
  
  configKey = 'custom';
  
  register() {
    // Enable boolean shorthand (custom: true)
    this._useShorthandConfig('custom');
    
    this._manager.add(
      'request:beforeRequest', 
      'custom:log', 
      this._log.bind(this), 
      10
    );
  }
  
  _log(context) {
    const config = context.config.custom;
    if (config.enable) {
      console.log(config.prefix, context.url);
    }
  }
}

// Usage
const client = new ApiClient({
  custom: true  // Uses defaults
});

// Or with custom config
const client = new ApiClient({
  custom: {
    enable: true,
    prefix: 'Token'
  }
});
```

---

## Built-in Features

### Caching

```js path=null start=null
const client = new ApiClient({
  cache: true  // Enable with defaults (5min TTL)
});

// Or with custom config
const client = new ApiClient({
  cache: {
    enable: true,
    ttl: 60000,              // 1 minute
    invalidateOn: ['POST', 'PUT', 'PATCH', 'DELETE']
  }
});
```

### Metrics Tracking

```js path=null start=null
const client = new ApiClient({
  metrics: true  // Track request duration, size, etc.
});

await client.get('/users').send();
// Metrics are available in request context
```

### Retry Failed Requests

```js path=null start=null
const client = new ApiClient({
  retry: {
    enable: true,
    maxAttempts: 3,
    methods: ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'],
    retryOn: [408, 429, 500, 502, 503, 504],  // Status codes
    backoff: {
      type: 'exponential',  // or 'fixed'
      base: 1000,           // 1s, 2s, 4s...
      jitter: 'full'        // Randomize timing
    }
  }
});
```

### Rate Limiting

```js path=null start=null
const client = new ApiClient({
  rateLimit: {
    enable: true,
    maxRequests: 10,
    window: 1000,           // 10 requests per second
    strategy: 'sliding',    // or 'fixed'
    scope: 'global',        // or 'per-endpoint'
    onRateLimit: (waitTimeMs) => {
      console.log(`Queued for ${waitTimeMs}ms`);
    }
  }
});
```

---

## Advanced Patterns

### Client-Level Body Defaults

```js path=null start=null
// Useful for adding metadata to all requests
const client = new ApiClient({
  body: { 
    app_version: '2.1.0',
    device_id: getDeviceId()
  }
});

await client.post('/events', { event_type: 'click' }).send();
// Sends: { app_version: '2.1.0', device_id: '...', event_type: 'click' }
```

### Removing Built-in Interceptors

```js path=null start=null
const client = new ApiClient({
  interceptors: [
    '-logger',      // Remove logging
    '-cache',       // Remove caching
    AuthInterceptor // Add custom
  ]
});
```

### Dynamic Config Updates

```js path=null start=null
const client = new ApiClient({ baseURL: 'https://api.example.com' });

// Update client config
client.config.headers.authorization = `Bearer ${newToken}`;

// Or create new instance for different auth
const adminClient = new ApiClient({
  baseURL: 'https://api.example.com',
  headers: { authorization: `Bearer ${adminToken}` }
});
```

---

## Migration Guide

### From Native Fetch

```js path=null start=null
// Before
const response = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token'
  },
  body: JSON.stringify({ name: 'John' })
});
const data = await response.json();

// After
const client = new ApiClient({ 
  baseURL: 'https://api.example.com',
  headers: { authorization: 'Bearer token' }
});
const data = await client.post('/users', { name: 'John' }).send();
```

### From v1 Hook Names

Old hooks have been renamed for clarity:

- `client_init` → `client:init`
- `default_config` → `request:defaultConfig`
- `before_fetch` → `request:beforeRequest`
- `fetch_response` → `request:formatResponse`
- `after_parse` → `request:formatData`
- `success` → `request:formatData` or `request:onResponse`
- `error` → `request:formatError` or `request:onError`
- `final` → `request:complete`

---

## Testing

All features are thoroughly tested with **362 passing tests** across:

- **ApiClient** (40 tests) — HTTP methods, config merging, interceptor registration
- **ApiRequest** (32 tests) — Lifecycle, hooks, error handling, recovery
- **InterceptorManager** (45 tests) — Hook management, priorities
- **Built-in Interceptors** (80+ tests) — Logger, Cache, CancelKey, StatusHandler, Recovery, Retry, etc.
- **Utilities** (19 tests) — Response parsing, request building

### Running Tests

```bash
npm test
```

---

## Browser & Environment Support

- **Modern Browsers** — All evergreen browsers (Chrome, Firefox, Safari, Edge)
- **React Native** — Full support including file uploads
- **Node.js** — Requires `fetch` polyfill (node-fetch, undici)
- **AbortController** — Required (polyfill available for older environments)

---

## Design Philosophy

1. **Minimal Core** — Client does one thing: coordinate requests
2. **Composable** — Features are opt-in via interceptors
3. **Explicit** — No magic, no surprises
4. **Type-Safe Ready** — Structure supports TypeScript
5. **Test-First** — All features thoroughly tested
6. **Framework Agnostic** — No React/framework dependencies

---

## Troubleshooting

### FormData not working

Make sure you're passing FormData at request time, not client level:

```js path=null start=null
// ❌ Don't do this
const client = new ApiClient({
  body: new FormData()  // Will throw error
});

// ✅ Do this
const formData = new FormData();
await client.post('/upload', formData).send();
```

### Headers not merging

Headers merge, not replace. To remove a header, set it to `undefined`:

```js path=null start=null
await client.get('/users', {
  headers: {
    authorization: undefined  // Remove client-level auth header
  }
});
```

### Debug logging not showing

Check scope filter:

```js path=null start=null
const client = new ApiClient({
  debug: { 
    enable: true, 
    scope: '*'  // Must include '*' or specific endpoint
  }
});
```

---

*Last Updated: October 2025*
