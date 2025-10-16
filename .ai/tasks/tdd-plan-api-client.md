# **TDD Plan: The `ApiClient`**

### **Phase 1: Utilities (The Foundation)** 🧱

This phase focuses on pure, stateless helper functions. They are the easiest to test as they have no dependencies.

- `[x]` **Setup**: Create the project structure and initialize your testing framework (e.g., Jest).

- `[x]` **Module: `utils/parser.js`**
  - `[x]` Create the test file: `utils/parser.test.js`.
  - `[x]` **Test 1**: Write a test for `parseShorthandUrl` to correctly split `"post:users/1"` into `{ method: 'post', url: 'users/1' }`.
  - `[x]` **Test 2**: Write tests for `parseInterceptorShorthand` covering all actions:
    - `'+logger@20'` -> `{ action: 'add', name: 'logger', priority: 20 }`
    - `'-logger'` -> `{ action: 'remove', name: 'logger' }`
    - `'~logger'` -> `{ action: 'replace', name: 'logger' }` (or whatever syntax you prefer)
  - `[x]` **Implementation**: Write the code in `utils/parser.js` to make all tests pass.

- `[x]` **Module: `utils/url.js`**
  - `[x]` Create the test file: `utils/url.test.js`.
  - `[x]` **Test 1**: Write a test for `serializeParams` to convert `{ page: 2, sort: 'asc' }` into `?page=2&sort=asc`.
  - `[x]` **Test 2**: Write a test to ensure it correctly URL-encodes special characters, like converting `{ q: 'hello world' }` into `?q=hello%20world`.
  - `[x]` **Test 3**: Write a test for an empty params object, ensuring it returns an empty string.
  - `[x]` **Implementation**: Write the code in `utils/url.js` to make all tests pass.

- `[x]` **Module: `utils/headers.js`**
  - `[x]` Create the test file: `utils/headers.test.js`.
  - `[x]` **Test 1**: Write a test for `mergeHeaders` to combine multiple header objects, ensuring that properties from later objects overwrite earlier ones.
  - `[x]` **Implementation**: Write the code in `utils/headers.js` to make all tests pass.

---

### **Phase 2: Core Data Structures** 🏗️

- `[ ]` **Module: `error.js`**
  - `[ ]` Create the test file: `error.test.js`.
  - `[ ]` **Test 1**: Write a test to ensure an `ApiError` instance correctly stores `status`, `response`, `requestConfig`, and a `message` passed to its constructor.
  - `[ ]` **Implementation**: Create the `ApiError` class in `error.js`.

- `[ ]` **Module: `InterceptorManager.js`**
  - `[ ]` Create the test file: `InterceptorManager.test.js`.
  - `[ ]` **Test 1**: Test the `add` method and verify an interceptor is stored correctly.
  - `[ ]` **Test 2**: Test that the `run` method executes interceptors in the correct priority order (lower numbers first).
  - `[ ]` **Test 3**: Test that the `run` method correctly passes the modified data from one interceptor to the next in the chain.
  - `[ ]` **Test 4**: Test the `remove` method.
  - `[ ]` **Implementation**: Build the `InterceptorManager` class.

---

### **Phase 3: Request & Response Logic** ⚙️

- `[ ]` **Module: `requestBuilder.js`**
  - `[ ]` Create the test file: `requestBuilder.test.js`.
  - `[ ]` **Test 1**: Test that it correctly combines a `baseURL` and a relative URL.
  - `[ ]` **Test 2**: Test that it correctly attaches serialized query `params`.
  - `[ ]` **Test 3**: Test that it `JSON.stringify`s an object body and sets the `Content-Type: application/json` header.
  - `[ ]` **Test 4**: Test that it does **not** set `Content-Type` when the body is a `FormData` object, as the browser must do this.
  - `[ ]` **Implementation**: Write the `requestBuilder.js` module.

- `[ ]` **Module: `responseParser.js`**
  - `[ ]` Create the test file: `responseParser.test.js`.
  - `[ ]` **Test 1**: Test that it correctly parses a successful JSON response.
  - `[ ]` **Test 2**: Test that it **throws an `ApiError`** when the response status is non-2xx (e.g., `404` or `500`).
  - `[ ]` **Test 3 (onStatus feature)**: Test that if an `onStatus` handler for a specific code (e.g., `422`) is provided, that handler is called and an `ApiError` is **not** thrown.
  - `[ ]` **Test 4 (onStatus feature)**: Test that the return value of an `onStatus` handler becomes the final result of the request.
  - `[ ]` **Implementation**: Write the `responseParser.js` module.

---

### **Phase 4: The `ApiClient` Integration** 🚀

This is the final phase. You will need to mock the global `fetch` function and likely use Jest's fake timers for timeout/retry tests.

- `[ ]` **Setup**: Create `ApiClient.test.js` and set up `fetch` mocking.

- `[ ]` **Test 1 (Basic Methods)**: Test `api.get('/users')` and `api.post('/users', { name: 'John' })`. Assert `fetch` was called with the correct final URL, method, headers, and stringified body.

- `[ ]` **Test 2 (Interceptors in Action)**:
  - `[ ]` Test that a `beforeRequest` interceptor can modify a header before `fetch` is called.
  - `[ ]` Test that an `onSuccess` interceptor can modify the final data returned to the user.
  - `[ ]` Test that an `onError` interceptor is called when `fetch` is mocked to fail, and that it can modify the thrown error.

- `[ ]` **Test 3 (Timeout Feature)**: Use fake timers to test that a request aborts and throws a specific timeout error if `fetch` doesn't resolve within the configured `timeout`.

- `[ ]` **Test 4 (Retry Feature)**:
  - `[ ]` Mock `fetch` to fail once with a status from `retryOn` (e.g., 503), then succeed. Configure `retries: 1`. Assert `fetch` was called twice.
  - `[ ]` Use fake timers to assert that the `retryDelay` was respected between the failed and retried calls.

- `[ ]` **Test 5 (cancelKey Feature)**: Fire two requests with the same `cancelKey`. Assert that the `AbortSignal` for the first request was triggered.

- `[ ]` **Test 6 (logLevel Feature)**: Test that when `logLevel: 'debug'` is set, `console.log` (or a mocked equivalent) is called.

- `[ ]` **Test 7 (transformResponse Feature)**: Make a request with a per-request `transformResponse` function and assert that the final resolved data is the transformed version.

- `[ ]` **Test 8 (Shorthand Methods)**:
  - `[ ]` Test `api.request('put:users/1', ...)` and assert `fetch` is called with `method: 'PUT'`.
  - `[ ]` Test `api.configureInterceptor('+name', ...)` to ensure it correctly calls the internal `InterceptorManager`.

- `[ ]` **Implementation**: Write the final `ApiClient.js` class, integrating all the modules you've built and tested to make these final integration tests pass.
