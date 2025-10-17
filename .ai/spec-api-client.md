# **Technical Specification: The `ApiClient`**

## **1. Overview & Core Philosophy**

The `ApiClient` is a modern, flexible, and framework-agnostic JavaScript API client. It is built with a modular, test-driven approach, prioritizing ease of use and powerful interceptor capabilities. It serves as the foundational **engine** for all HTTP requests, designed to be robust and highly configurable. It knows how to talk to a server but knows nothing about UI frameworks.

---

## **2. Core Modules & Responsibilities**

_(Updated paths reflect the final folder structure)_

- **`src/client/ApiClient.js` (Public Interface)**: The main class the user interacts with. Orchestrates internal modules and provides public methods (`.get`, `.post`, `.request`, etc.). Manages the retry loop and cancellation map.
- **`src/client/internals/InterceptorManager.js`**: Manages the lifecycle of interceptors (add, remove, run pipelines) based on priority.
- **`src/client/internals/requestBuilder.js`**: Pure function that takes merged configuration and builds the final `fetch` URL and options object. Automatically handles JSON stringification and `FormData` creation (including for file objects/arrays).
- **`src/client/internals/responseParser.js`**: Pure async function that processes the raw `fetch` response. Handles `onStatus` callbacks, attempts JSON parsing (with optional `autoFixJson`), and throws `ApiError` on failures.
- **`src/core/ApiError.js`**: Defines the custom `ApiError` class extending `Error`, containing `config`, `response`, and `status` properties.
- **`src/utils/`**: Contains pure helper functions for URL parameter serialization (`serializeParams` supporting arrays), header merging (`mergeHeaders`), and shorthand parsing (`parseShorthandUrl`, `parseInterceptorShorthand`).

---

## **3. `ApiClient` Class Details**

### **Public Methods**

- `constructor(config = {})`: Initializes the client with instance configuration, sets up the interceptor manager, cancellation map, and optionally adds the internal logger.
- `get = async (url, options = {})`: Performs a GET request.
- `post = async (url, body, options = {})`: Performs a POST request.
- `put = async (url, body, options = {})`: Performs a PUT request.
- `patch = async (url, body, options = {})`: Performs a PATCH request.
- `delete = async (url, options = {})`: Performs a DELETE request.
- `request = async (shorthandUrl, ...args)`: Delegates to appropriate method based on shorthand (e.g., `"post:users"`).
- `configureInterceptor = (shorthand, callbacks)`: Adds/removes interceptors using shorthand (e.g., `"+logger@10"`).

### **Private Methods (Conceptual)**

- `_request(requestSpecificConfig)`: Main orchestrator, manages the retry loop.
- `_executeAttempt(config)`: Orchestrates a single attempt (setup, execute, cleanup).
- `_setupAttempt(config)`: Handles `AbortController`, `cancelKey`, and `setTimeout`. Returns `{ controller, timeoutId }`.
- `_performFetch(config, controller)`: Runs `onRequest` interceptors, builds request, calls `fetch`, parses response (via `responseParser`), handles `transformResponse`, runs `onSuccess` interceptors. Catches errors and handles timeout `AbortError`.
- `_cleanupAttempt(config, timeoutId)`: Clears timeout and removes `cancelKey` entry.

---

## **4. Configuration Objects**

### **Instance Configuration (`new ApiClient(config)`)**

- `baseURL`: `string` - Base URL for requests.
- `headers`: `object` - Default headers.
- `timeout`: `number` - Default request timeout in `ms`.
- `interceptors`: `array` - Initial array of interceptor objects `{ name, callbacks, priority }`.
- `logLevel`: `'none' | 'debug'` - Enables a built-in console logging interceptor.
- `retries`: `number` (default: `0`) - Default number of retry attempts.
- `retryDelay`: `(attempt: number) => number` - Function calculating delay before retry (default: exponential backoff).
- `retryOn`: `array` - Status codes or `'network-error'` that trigger a retry (default: `[503, 'network-error']`).
- `autoFixJson`: `boolean` (default: `false`)
  - **Description**: If `true`, the `responseParser` will attempt to strip leading non-JSON text from a response body if the initial JSON parse fails. A warning is logged if successful.
  - **Common Scenario**: Dealing with legacy PHP APIs that sometimes prefix JSON responses with warnings or notices.

### **Per-Request Options (e.g., `api.get(url, options)`)**

- `headers`: `object` - Merged with/overrides instance headers.
- `params`: `object` - Query parameters (supports arrays via key repetition).
- `timeout`: `number` - Request-specific timeout.
- `interceptors`: `object` - Manage interceptors for this request: `{ append: [], prepend: [], replace: [] }`. _(Note: Implementation TBD)_
- `cancelKey`: `string | symbol` - Key to auto-abort previous requests.
- `onStatus`: `object` - Map of status codes/ranges to handlers, run _before_ interceptors.
- `transformResponse`: `(data) => any` - Function to reshape successful data _after_ parsing but _before_ `onSuccess` interceptors.
- `retries`, `retryDelay`, `retryOn`, `autoFixJson`: Can override instance defaults for a single request.
- `_bypassOffline`: `boolean` (Internal flag used by ApiAgent replay).

---

## **5. Key Implementation Details**

- **File Uploads:** Automatically detects request bodies containing file-like objects (`{ uri, name, type }`) or arrays of them (even nested) and constructs a `FormData` object. Lets the environment set the `Content-Type` for `FormData`.
- **Error Handling:** Non-2xx responses or parsing failures result in an `ApiError` being thrown, containing `config`, `response` (`{ data, status }`), and `status`. Timeout aborts throw a specific `ApiError`. Other aborts (like `cancelKey`) re-throw the original `AbortError` after cleanup.
- **Interceptors:** Run via `InterceptorManager`. `onRequest` runs before `fetch`, `onSuccess` runs on successfully parsed/transformed data, `onError` runs on thrown errors (`ApiError` or others). `onStatus` handlers bypass interceptors.
- **Retries:** Handled in a loop within `_request`. Only retries based on `retryOn` conditions.
- **Timeouts & Cancellation:** Managed via `AbortController` in `_setupAttempt` and `_cleanupAttempt`. Uses `signal.reason` to distinguish timeout aborts.
