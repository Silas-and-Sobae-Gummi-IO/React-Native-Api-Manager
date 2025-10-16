# **Technical Specification: The `ApiClient`**

## **1. Overview & Core Philosophy**

The `ApiClient` is a modern, flexible, and framework-agnostic JavaScript API client. It is built with a modular, test-driven approach, prioritizing ease of use and powerful interceptor capabilities. It serves as the foundational **engine** for all HTTP requests, designed to be robust and highly configurable. It knows how to talk to a server but knows nothing about UI frameworks.

## **2. Core Modules & Responsibilities**

* **`ApiClient.js` (Public Interface)**: The main class the user interacts with. It orchestrates all internal modules.
* **`InterceptorManager.js` (The "Hooks" Engine)**: Manages the lifecycle of interceptors based on the WordPress model (hooks, priority).
* **`requestBuilder.js` (Request Composer)**: A pure module that takes user-friendly options and builds the final config object required by `fetch`.
* **`responseParser.js` (Response Handler)**: A pure module that processes the raw `fetch` response, handles `onStatus` callbacks, and throws custom errors.
* **`error.js` (Custom Error)**: Defines the `ApiError` class for consistent, predictable error handling. It will contain rich context like the status code, response body, and original request config.
* **`utils/` (Helper Functions)**: A collection of pure, stateless functions for parsing (`"post:users"`), URL serialization (`?q=test`), and header merging.

---

## **3. Configuration Objects**

Configuration is layered. Per-request options always override instance options.

### **Instance Configuration (`new ApiClient(config)`)**

This object defines the default behavior for every request made by this client instance.

* `baseURL`: `string`
    * **Description**: A URL string that will be prepended to all relative request paths.
    * **Common Scenario**: You have one client dedicated to your main REST API. You set `baseURL: 'https://api.myapp.com/v1'` once, then you can make requests like `api.get('/users')` instead of typing the full URL every time.

* `headers`: `object`
    * **Description**: A plain object of headers to be sent with every request.
    * **Common Scenario**: Setting default headers for your API, like `{'Accept': 'application/json', 'Content-Type': 'application/json'}`. This is also where you would set a long-lived API key.

* `timeout`: `number`
    * **Description**: The default time in milliseconds that a request will wait for a response before it is automatically aborted.
    * **Common Scenario**: To prevent your app from hanging indefinitely on a slow network, you can set a global `timeout: 15000` (15 seconds). If any request takes longer than that, it will fail with a specific timeout error.

* `interceptors`: `array`
    * **Description**: An initial array of interceptor objects to apply globally for this instance.
    * **Common Scenario**: A logging interceptor that `console.log`s every request could be added here so that it's active from the moment the client is created.

* `logLevel`: `'none' | 'debug'`
    * **Description**: Enables or disables a built-in, pre-configured logging interceptor for easy debugging.
    * **Common Scenario**: During development, you set `logLevel: 'debug'` to see all outgoing requests and incoming responses in the console without writing a custom interceptor. In production, you set it to `'none'` to disable the logs.

* `retries`: `number` (default: `0`)
    * **Description**: The number of times to automatically retry a failed request.
    * **Common Scenario**: A user's device briefly loses network connection, causing a request to fail. Instead of showing an immediate error, you set `retries: 2`. The client will automatically try the request two more times before giving up. This makes the app feel much more resilient to temporary network blips.

* `retryDelay`: `(attempt: number) => number`
    * **Description**: A function to calculate the delay in `ms` before the next retry. The default should be an exponential backoff (e.g., `1000 * 2 ** attempt`), which waits longer between each retry to avoid overwhelming a struggling server.
    * **Common Scenario**: When retrying, you don't want to spam the server immediately. Exponential backoff means the client waits 1s, then 2s, then 4s, giving the network or server time to recover.

* `retryOn`: `array`
    * **Description**: An array of status codes or the string `'network-error'` that should trigger a retry.
    * **Common Scenario**: You only want to retry on specific, temporary server errors. You would set `retryOn: [503, 'network-error']`. This means "retry if the server is temporarily unavailable (503) or if there's a device network error, but do **not** retry on a `404 Not Found` error, because that is a permanent failure."

### **Per-Request Options (`api.get('/users', options)`)**

This object allows you to override or add to the instance configuration for a single, specific request.

* `headers`: `object`
    * **Description**: Headers that will be merged with/override instance headers for this request only.
    * **Common Scenario**: Most of your requests are JSON, but for one specific file upload, you need to send a different header. You can specify it here without affecting other requests. `api.post('/upload', formData, { headers: {'X-Custom-Header': 'value'} })`.

* `params`: `object`
    * **Description**: An object of query parameters to be serialized and appended to the URL.
    * **Common Scenario**: Instead of manually building a URL like `'/search?q=hello%20world&status=active'`, you can simply provide `{ params: { q: 'hello world', status: 'active' } }`. The client handles the encoding and formatting for you.

* `cancelKey`: `string | symbol`
    * **Description**: A unique identifier. If a new request is made with the same `cancelKey` before this one completes, this request will be automatically aborted.
    * **Common Scenario**: A user is typing rapidly in a search bar. You fire a request for each keystroke with `cancelKey: 'search-input'`. This ensures that only the request for the very latest text ("react") is allowed to complete; all previous requests ("r", "re", "rea") are cancelled. This prevents race conditions and saves network resources.

* `onStatus`: `object`
    * **Description**: A map of status codes (`200`, `'4xx'`), or wildcards (`'*'`) to callback functions. These callbacks run *before* any interceptors and can completely bypass the standard response/error flow.
    * **Common Scenario**: Your API sometimes returns a `202 Accepted` status to indicate a long-running job. You can use `{ onStatus: { 202: () => showJobPendingToast() } }` to handle this specific case cleanly without needing a complex interceptor. Or, for a form, `{ onStatus: { 422: (res) => setFormErrors(res.data.errors) } }` to handle validation errors directly.

* `transformResponse`: `(data) => any`
    * **Description**: A function to re-shape the successful response data before it's returned from the promise. Runs after parsing but before success interceptors.
    * **Common Scenario**: The API returns a deeply nested object like `{ data: { attributes: { user: { name: 'John' } } } }`. You can use `transformResponse: (data) => data.data.attributes.user` to simplify the final returned data to just `{ name: 'John' }`.
