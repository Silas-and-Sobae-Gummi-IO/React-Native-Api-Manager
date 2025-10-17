# **Technical Specification: The `ApiAgent`**

## **1. Overview & Core Philosophy**

The `ApiAgent` is a high-level service layer that manages, configures, and enhances all `ApiClient` instances within an application. It acts as the central **command center** for cross-cutting concerns like conditional retries (e.g., auth refresh), offline support, request scheduling, and global configuration.

It uses a **Flexible Singleton** pattern: a default instance (`agent`) is exported, alongside the `ApiAgent` class itself.

---

## **2. Core Modules & Responsibilities**

- **`src/agent/ApiAgent.js` (Public Interface)**: The main class. Manages clients, global config/interceptors, and orchestrates internal helpers. Provides public API methods.
- **`src/agent/internals/RequestScheduler.js`**: Internal class managing request channels, concurrency limits, pausing, request queues (priority-sorted), and cancellation scopes.
- **`src/agent/internals/ConditionalRetrier.js`**: Internal class managing the logic for a single condition-based retry flow (detect error, pause queue, run handler, resume queue).
- **`src/agent/internals/OfflineManager.js`**: Internal class managing offline request queuing, interacting with `StorageAdapter` and `NetInfo`, and triggering replay.

---

## **3. `ApiAgent` Class Details**

### **Public Methods**

- `constructor()`: Initializes client map, global config, interceptor list, scheduler, and retrier list.
- `setGlobalConfig(config)`: Sets/merges base configuration inherited by new clients.
- `createClient(name, config = {})`: Creates/re-creates an `ApiClient`. **Decorates** the client's `_executeAttempt` method to integrate scheduler and conditional retriers. Applies global interceptors. Stores `{ instance, config }`.
- `getClient(name)`: Retrieves a client instance by name. Throws if not found.
- `updateClientConfig(name, newConfig)`: Updates a client's config by merging and re-creating it via `createClient`.
- `addGlobalInterceptor(name, callbacks, options = {})`: Adds an interceptor config to the agent's list and applies it to relevant clients (using `client.interceptors.add`). Handles `priority` and `clients` scope. Idempotent (removes existing before adding).
- `removeGlobalInterceptor(name)`: Removes an interceptor config from the agent and calls `client.interceptors.remove` on relevant clients based on original scope.
- `addRetryHandler(options)`: Creates and registers a `ConditionalRetrier`. Requires `{ name, shouldRetry: (error) => boolean, handler: async (error) => Promise<void> }`. Idempotent (removes existing by name).
- `removeRetryHandler(name)`: Removes a conditional retrier by name.
- `configureChannels(channelConfig)`: Delegates to `scheduler.configureChannels`.
- `pauseChannel(channelName)`: Delegates to `scheduler.pauseChannel`.
- `resumeChannel(channelName)`: Delegates to `scheduler.resumeChannel`.
- `abortScope(scopeName)`: Delegates to `scheduler.abortScope`.
- `enablePersistence({ adapter, netInfo })`: Creates the `OfflineManager`. Defines a `replayRequestFn` that uses a default client with `_bypassOffline`. Injects a global interceptor (`internal-offline-handler`) to check `offlineManager.shouldQueue` and potentially throw `queueError`.

### **Internal Logic**

- **Decorator in `createClient`**: Wraps the `ApiClient`'s `_executeAttempt`.
  1.  Calls `client._setupAttempt` to get the real `controller`.
  2.  Defines `attemptFn` which calls `scheduler.schedule` with the original execute logic and the real controller.
  3.  Calls `attemptFn()`.
  4.  In `catch` block: Iterates through `conditionalRetriers`. If one `handleError`, returns its promise. Otherwise, re-throws original error.
  5.  Ensures `client._cleanupAttempt` is called appropriately after success, failure, or retry.
- **`enablePersistence`**: Creates `OfflineManager` and adds an `onRequest` interceptor that checks `offlineManager.shouldQueue`. If true, calls `offlineManager.queueRequest` and throws a specific error (`isOfflineQueueError: true`) to stop the request chain.

---

## **4. Advanced Feature Modules (Details)**

### **4.1. Conditional Retries (Formerly Auth Refresh)**

- **Mechanism**: Managed by `ConditionalRetrier` instances stored in `agent.conditionalRetriers`.
- **Trigger**: Agent's decorated `_executeAttempt` catches errors and iterates through retriers, calling `retrier.handleError(error, attemptFn, controller)`.
- **`ConditionalRetrier` Logic**:
  - Checks `shouldRetry(error)`.
  - If true and not already running, runs the async `handler(error)`. Pauses subsequent matching requests.
  - After handler completes (success/fail), processes paused queue (`_processPausedRequests`): retries on handler success, rejects on handler failure.
- **`addRetryHandler`**: Public API to register different retry conditions (e.g., auth (401), maintenance mode (503)).

### **4.2. Offline Persistence & Replay**

- **Mechanism**: Managed by `OfflineManager` instance (created by `enablePersistence`). Requires user-provided `StorageAdapter` and `NetInfo`.
- **`StorageAdapter` Interface**: `{ getQueue(): Promise<SerializedRequest[]>, queueRequest(req): Promise<void>, dequeueRequests(ids): Promise<void> }`.
- **Queuing**: Agent adds a high-priority `onRequest` interceptor. If `offlineManager.shouldQueue(method)` is true (offline & write method), interceptor calls `offlineManager.queueRequest(config)` and throws `queueError`.
- **Replay**: `OfflineManager` listens to `NetInfo`. On transition to online, calls `adapter.getQueue`, then iterates, calling the agent-provided `replayRequestFn` for each item. On success, calls `adapter.dequeueRequests`. Stops on first replay error.
- **`replayRequestFn`**: Defined in `enablePersistence`. Uses a client (e.g., `'default'`) and passes `{ _bypassOffline: true }` option to its request method to skip the queue check.

### **4.3. Intelligent Request Scheduling & Channels**

- **Mechanism**: Managed by `RequestScheduler` instance.
- **Configuration**: `agent.configureChannels({ name: { concurrency: number } })`. Default channel `'default'` has `Infinity` concurrency.
- **Scheduling**: Agent's decorated `_executeAttempt` calls `scheduler.schedule(attemptFn, config, controller)`.
- **`RequestScheduler` Logic**:
  - Adds task to channel queue (sorted by `priority` option, default 0).
  - Checks concurrency & paused status (`_processQueue`).
  - If slot available, runs `attemptFn`. Manages active request set.
  - `finally` block cleans up active set, scope map, and calls `_processQueue` again.
- **Pausing**: `agent.pauseChannel` / `agent.resumeChannel` delegate to scheduler, toggling `paused` flag and calling `_processQueue` on resume.

### **4.4. Scoped Request Cancellation**

- **Mechanism**: Managed by `RequestScheduler`.
- **Association**: `scheduler.schedule` adds `controller` to `scopes` map if `config.scope` is present.
- **Cancellation**: `agent.abortScope` delegates to `scheduler.abortScope`, which finds controllers in map and calls `.abort()`. Cleanup happens in `_processQueue`'s `finally`.

### **4.5. Performance Monitoring & Telemetry**

- _(Spec only, implementation TBD)_ Requires adapter. Agent would likely inject interceptors to time requests and call `adapter.trackEvent`.

### **4.6. Built-in Mocking Adapter**

- _(Spec only, implementation TBD)_ Agent would likely inject a high-priority interceptor to check for mock handlers and return mock data, bypassing scheduler and fetch.
