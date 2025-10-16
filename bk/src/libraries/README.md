# ApiClient Documentation

The `ApiClient` is a modern and flexible `fetch`-based client for handling all network requests. It's designed to be configured once and used throughout your application, either standalone or injected into the `useApi` hook.

## ✨ Features

- **Fluent, RESTful Interface**: Intuitive methods like `.get()`, `.post()`, `.upload()`, etc.
- **Promise-Based**: Built on `async/await` for clean, modern asynchronous code.
- **Global Configuration**: Set a `baseUrl`, static headers, and dynamic headers (for auth tokens) in one place.
- **Interceptors**: Hook into the request/response lifecycle to globally manage requests, responses, and errors.
- **Structured Error Handling**: Throws a custom `ApiError` with status and data for predictable error handling.
- **Graceful Abort Handling**: Aborted requests resolve to `null` by default, simplifying component cleanup logic.
- **Parallel Requests**: Run multiple API calls at once with `apiClient.all([...])`.
- **Smart URI Parsing**: Use shortcuts like `apiClient.request('post:users', ...)` for convenience.

## 🚀 Setup & Configuration

The `ApiClient` is created using the `createApiClient` factory function. You should create a single instance (a singleton) for each distinct API your application communicates with.

**`src/services/apiClient.js`**

```javascript
import {createApiClient, ApiError} from '@gummi-io/react-native-api-manager';
import store from './store'; // Example: your global store for tokens

export const apiClient = createApiClient({
  // The base URL for all requests
  baseUrl: '[https://api.yourapp.com/v1](https://api.yourapp.com/v1)',

  // If true, aborted requests resolve to `null` instead of throwing an error.
  returnNullOnAbort: true,

  // Function to provide dynamic headers, like an auth token, for every request
  getDynamicHeaders: async () => {
    const token = store('auth').get('accessToken');
    if (token) {
      return {Authorization: `Bearer ${token}`};
    }
    return {};
  },

  // Global interceptors to manage the request lifecycle
  interceptors: {
    // Runs before every request is sent
    onRequest: async (requestOptions, callContext) => {
      console.log(`Sending ${requestOptions.method} to ${callContext.uri}`);
      return requestOptions;
    },
    // Runs only on successful responses
    onResponse: async (responseData, response) => {
      // Example: Log a custom header from the response
      const requestId = response.headers.get('X-Request-ID');
      console.log(`Received response for request ID: ${requestId}`);
      return responseData; // Must return the data
    },
    // Runs on any thrown error (network or ApiError)
    onError: async error => {
      if (error instanceof ApiError && error.status === 401) {
        console.log('Unauthorized! Logging out...');
        // Call your app's global logout function here
      }
      // Re-throw the error so the useApi hook can still handle it
      throw error;
    },
    // Runs after every request, regardless of success or failure
    onFinally: async () => {
      console.log('Request finished.');
    },
  },
});
```

## 📚 API Reference

### Core Methods

#### `apiClient.request(uri, options?)`

The most versatile method. It can handle any request type and understands the `'method:endpoint'` syntax.

- **`uri`**: The endpoint, e.g., `'users'` or `'post:users'`. Defaults to `GET`.
- **`options`**: An object containing:
  - `body`: The request payload for `POST`, `PUT`, etc.
  - `params`: An object of query parameters for `GET` requests.
  - `headers`: Per-request headers that override global ones.
  - `onRequest`, `onResponse`: Per-request interceptors.

```javascript
// A GET request with query params
apiClient.request('users', {params: {page: 2, limit: 10}});

// A POST request with a body
apiClient.request('post:users', {body: {name: 'Alan'}});
```

#### `apiClient.get(uri, params?, options?)`

A convenient shortcut for `GET` requests.

```javascript
apiClient.get('users', {page: 2});
```

#### `apiClient.post(uri, body?, options?)`

A shortcut for `POST` requests.

```javascript
apiClient.post('users', {name: 'Alan'});
```

#### `apiClient.upload(uri, data, options?)`

Handles `multipart/form-data` uploads. `data` should be a simple object.

```javascript
const userProfile = {
  name: 'Alan',
  avatar: {
    uri: 'file:///path/to/image.jpg',
    name: 'avatar.jpg',
    type: 'image/jpeg',
  },
};
apiClient.upload('profile/avatar', userProfile);
```

#### `apiClient.all(requests)`

Executes multiple requests in parallel and resolves when all are complete. If any request is aborted, the entire promise will resolve to `null` (if `returnNullOnAbort` is true).

- **`requests`**: An array of request objects: `{ method, uri, params?, body? }`.

```javascript
const [user, teams] = await apiClient.all([
  {method: 'get', uri: 'users/me'},
  {method: 'get', uri: 'teams'},
]);
```

### Header Management

- **`apiClient.setHeader(key, value)`**: Sets a header that will persist for all subsequent calls on this client instance.
- **`apiClient.unsetHeader(key)`**: Removes a persistent header.
- **`apiClient.clearHeaders()`**: Clears all persistent headers.

### Abort Handling

- **`apiClient.abort()`**: Aborts any in-flight request initiated by this client instance. This is used internally by the hooks.
