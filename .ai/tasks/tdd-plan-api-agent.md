# **TDD Plan: The `ApiAgent`**

### **Phase 1: Core Registry & Factory** 🏭

This phase focuses on the agent's primary role: creating, managing, and configuring client instances.

* `[ ]` **Setup**: Create `ApiAgent.js` and its corresponding `ApiAgent.test.js`. You will need to mock the `ApiClient` class itself for these tests.

* `[ ]` **Test 1 (Singleton Pattern & Instantiation)**:
    * `[ ]` Test that the default export is a valid, single instance of `ApiAgent`.
    * `[ ]` Test that you can also import the `ApiAgent` class and create a new, separate instance for testing purposes.

* `[ ]` **Test 2 (Client Factory & Configuration)**:
    * `[ ]` Test the `createClient` method. Assert that a new mock `ApiClient` instance is created and stored internally.
    * `[ ]` Test `setGlobalConfig`. Call it with a global `timeout`. Then, call `createClient` and assert that the mock `ApiClient` was instantiated with that `timeout` value.
    * `[ ]` Test that a client-specific config provided to `createClient` correctly overrides the global config.
    * `[ ]` Test the `getClient` method, including the error case where a client name does not exist.
    * `[ ]` Test `updateClientConfig`. Create a client, then call this method and assert that a configuration method on the mock client (e.g., `client.setHeader`) was called.

* `[ ]` **Test 3 (Global & Scoped Interceptors)**:
    * `[ ]` Test `addGlobalInterceptor` without a scope. Create two mock clients. Add the interceptor. Assert that the `addInterceptor` method was called on **both** mock clients.
    * `[ ]` Test `addGlobalInterceptor` **with a scope**. Create three clients (`serviceA`, `serviceB`, `serviceC`). Add an interceptor with `options: { clients: ['serviceA', 'serviceC'] }`. Assert `addInterceptor` was called on `serviceA` and `serviceC`, but **not** on `serviceB`.
    * `[ ]` Test that adding a new client after a global interceptor has been set up correctly receives that interceptor.
    * `[ ]` Test `removeGlobalInterceptor`.

* `[ ]` **Implementation**: Build the core `ApiAgent` class, focusing on the client map, config merging, and interceptor logic.

---

### **Phase 2: Intelligent Schedulers & Controllers** 🚦

This phase focuses on the agent's ability to manage and control in-flight requests across all its clients.

* `[ ]` **Setup**: You will need a way to mock the `ApiClient`'s request methods (`get`, `post`, etc.) to simulate pending, resolving, and rejecting requests.

* `[ ]` **Test 1 (Request Channels & Concurrency)**:
    * `[ ]` Configure a channel with `concurrency: 1`.
    * `[ ]` Mock three client requests on that channel. The mock should not resolve immediately.
    * `[ ]` Assert that only **one** request is started initially.
    * `[ ]` Resolve the first request. Assert that the second request is then started.
    * `[ ]` Resolve the second request. Assert that the third request is then started.

* `[ ]` **Test 2 (Pausing & Resuming)**:
    * `[ ]` Call `agent.pauseChannel('background')`.
    * `[ ]` Fire a request on the `'background'` channel. Assert that the mock client's request method was **not** called.
    * `[ ]` Call `agent.resumeChannel('background')`.
    * `[ ]` Assert that the request method is now called.

* `[ ]` **Test 3 (Scoped Cancellation)**:
    * `[ ]` Mock two pending requests with `scope: 'dashboard'` and one with `scope: 'analytics'`. Each request mock should have its own mock `AbortController`.
    * `[ ]` Call `agent.abortScope('dashboard')`.
    * `[ ]` Assert that the `.abort()` method was called on the two dashboard controllers, but **not** on the analytics controller.

* `[ ]` **Implementation**: Build the internal queuing, scheduling, and cancellation logic for the agent. This will likely involve managing several internal state objects (queues per channel, map of scopes to controllers, etc.).

---

### **Phase 3: High-Level Feature Modules** ✨

This phase tests the most advanced, application-wide features. Each one can be tested in isolation.

* `[ ]` **Test 1 (Automatic Token Refresh)**:
    * `[ ]` Mock a client to fail a request with a `401` error.
    * `[ ]` Register an `onAuthFailure` handler. The handler should return a new token.
    * `[ ]` During the initial `401` failure, fire a second, separate request.
    * `[ ]` Assert that the `onAuthFailure` handler was called only **once**.
    * `[ ]` Assert that the second request was paused (not sent immediately).
    * `[ ]` After the handler resolves, assert that the first request was retried and the second request was finally sent, both with the new token.

* `[ ]` **Test 2 (Offline Persistence & Replay)**:
    * `[ ]` Provide a mock `StorageAdapter` and a mock `NetInfo` service.
    * `[ ]` Set the mock network status to "offline."
    * `[ ]` Make a POST request. Assert that the mock client's `post` method was **not** called, but that `adapter.queueRequest` **was** called.
    * `[ ]` Set the mock network status to "online."
    * `[ ]` Assert that `adapter.getQueuedRequests` was called, and now the mock client's `post` method is finally called to replay the request.

* `[ ]` **Test 3 (Built-in Mocking)**:
    * `[ ]` Register a mock handler using `agent.mock('get:/users/1', { body: { name: 'Mock User' } })`.
    * `[ ]` Call `agent.enableMocks()`.
    * `[ ]` Make a request from a client to `/users/1`.
    * `[ ]` Assert that `fetch` (or the client's internal request method) was **not** called, and that the request promise resolved with the mock data.

* `[ ]` **Test 4 (Performance Telemetry)**:
    * `[ ]` Provide a mock `PerformanceAdapter`.
    * `[ ]` Call `agent.enablePerformanceTracking({ adapter: mockAdapter })`.
    * `[ ]` Make a client request and have it resolve after a simulated delay (using fake timers).
    * `[ ]` Assert that `adapter.trackEvent` was called with the correct event name (`request:latency`) and a duration value.

* `[ ]` **Implementation**: Build each of these advanced feature modules one by one, integrating them into the agent's lifecycle using the interceptor system we designed.
