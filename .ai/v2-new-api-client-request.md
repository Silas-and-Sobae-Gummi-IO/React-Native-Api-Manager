# API Client & Request Library Documentation

## Overview

This library provides a modular, hook-based API client system for JavaScript/React projects.
Key features include:

- Modular request-level and global interceptors
- Retry logic and configurable delays
- Abort/cancel handling
- Logging support
- Flexible `.send()` usage with overrides

---

## Core Components

### `ApiClient`

- Manages global configuration and registered interceptors
- Creates individual requests using `.get()`, `.post()`, etc.
- Holds reusable hooks/interceptors shared across requests
- Example usage:

```javascript
import client from './apiClient';

const api = client.post({url: '/posts', body: {title: 'Hello'}});
const response = await api.send();
```

- Global configuration can include:
  - `headers`: default request headers
  - `hooks`: e.g., `onSuccess`, `onError`
  - `interceptors`: list of interceptor classes to attach

---

### `ApiRequest`

- Represents a single request instance
- Accepts local configuration overriding the global client config
- Contains its own interceptors isolated from other requests
- Example usage:

```javascript
const request = client.get({
  url: '/users',
  interceptors: [
    class CustomInterceptor {
      register(hooks) {
        hooks.add('success', 'log', (payload) => console.log(payload.data));
      }
    },
  ],
});

const result = await request.send({params: {page: 1}});
```

- `.send(overrides)`:
  - Overrides request-specific values (body, params, etc.)
  - Does **not** overwrite global client config
- `.abort()`:
  - Cancels the current request using `AbortController`

---

## Interceptors

Interceptors are modular hooks that allow modifying request behavior or observing events.

### Built-in Interceptors

1. **LoggerInterceptor**
   - Logs requests and responses when `client.config.debug = true`
   - Hooks: `request_setup`, `before_fetch`, `final`

2. **RetryInterceptor**
   - Automatically retries failed requests based on retry config
   - Hooks: `error` (handles retry logic), `request` (config attachment)
   - Retry configuration example:

```javascript
retry: {
  attempts: 3,
  on: [503, 'network-error'],
  delay: (attempt) => attempt * 500 // delay in ms
}
```

3. **CancelKeyInterceptor**
   - Cancels previous requests sharing the same `cancelKey`
   - Useful for search inputs or UI interactions that trigger multiple requests
   - Hooks: `request_setup`, `final`

4. **CoreInterceptor**
   - Applies default config values
   - Registers built-in interceptors automatically
   - Hook: `client_init`

---

## Using Interceptors

- Global interceptors: attached to the client instance
- Request-level interceptors: isolated for individual requests
- Example:

```javascript
const api = client.post({
  url: '/posts',
  interceptors: [LoggerInterceptor, RetryInterceptor],
});
await api.send();
```

- Custom interceptors can define hooks on:
  - `request_setup`: modify config/context before fetch
  - `before_fetch`: modify fetch init parameters
  - `success`: observe successful response
  - `error`: handle request errors
  - `final`: cleanup or logging after request completes

---

## Request Flow

```
ApiRequest.send() called
        │
        ▼
  request_setup hooks
        │
        ▼
  before_fetch hooks
        │
        ▼
      fetch()
        │
   ┌────┴────┐
 success?   error?
   │          │
success hooks error hooks
   │          │
   └────┬─────┘
        ▼
    final hooks
        │
        ▼
Promise resolves with payload { ok, data, error }
```

---

## React Example

```javascript
import client from './apiClient';
import {useState, useEffect} from 'react';

function PostsComponent() {
  const [posts, setPosts] = useState([]);

  const request = client.get({
    url: '/posts',
    interceptors: [
      class OnSuccessInterceptor {
        register(hooks) {
          hooks.add('success', 'setPosts', (payload) => setPosts(payload.data));
        }
      },
    ],
  });

  useEffect(() => {
    request.send({params: {page: 1}});
    return () => request.abort();
  }, []);

  const loadMore = () => request.send({params: {page: 2}});

  return <div>{posts.length} posts</div>;
}
```

---

## Notes

- Request-level interceptors are isolated from the client-level interceptors.
- `.send()` is **manual**; no auto-start.
- Retry logic is handled **entirely** by interceptors; the request itself is unaware of retry state.
- AbortController is automatically created per request, but can be overridden.
- Interceptors provide a flexible system to handle logging, retries, cancellation, and other behaviors without coupling to core request logic.
