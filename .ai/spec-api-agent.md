# **Technical Specification: The `ApiAgent`**

## **1. Overview & Core Philosophy**

The `ApiAgent` is a high-level service layer that manages, configures, and enhances all `ApiClient` instances within an application. It acts as the central **command center** for cross-cutting concerns like authentication, offline support, and global configuration, promoting a clean, DRY (Don't Repeat Yourself), and resilient network architecture.

It is designed using a **Flexible Singleton** pattern: a default instance is exported for easy application-wide use, while the class itself is also exported for testing and advanced use cases. This provides the convenience of a singleton with the testability of a standard class.

---

## **2. Core API & Configuration**

### **2.1. Instance & Client Management**

* `createClient(name: string, config: ApiClientConfig): ApiClient`
    * **Description**: Instantiates a new `ApiClient`, registers it under a unique name, and intelligently merges the global agent configuration with the client-specific config. It also applies any relevant global interceptors.
    * **Common Scenario**: In your app's setup file, you'll create clients for the different services you talk to. For example: `agent.createClient('default', { baseURL: 'https://api.myapp.com/v1' })` and `agent.createClient('analytics', { baseURL: 'https://analytics.myapp.com' })`. You can then retrieve these configured clients from anywhere using `agent.getClient('default')`.

* `getClient(name: string): ApiClient`
    * **Description**: Retrieves a registered client instance by its name.
    * **Common Scenario**: Inside a service file or a React hook, you need to make an API call. You simply import the global agent and call `const client = agent.getClient('default');` to get the correctly configured instance.

* `setGlobalConfig(config: ApiClientConfig)`
    * **Description**: Sets the base configuration that all newly created clients will inherit.
    * **Common Scenario**: You want every single API client in your app to have a default timeout of 20 seconds and to log errors in debug mode. You call `agent.setGlobalConfig({ timeout: 20000, logLevel: 'debug' })` once at startup.

### **2.2. Global & Scoped Interceptors**

* **`addGlobalInterceptor(name: string, interceptor: Interceptor, options?: { priority?: number, clients?: string[] })`**
    * **Description**: Adds a named interceptor. If the `options.clients` array is provided, the interceptor is applied only to that specific group of clients. Otherwise, it is applied to all current and future clients.
    * **Common Scenario 1 (Truly Global)**: You want to add a logging interceptor that reports every single network error to a service like Sentry. You would add it without a scope: `agent.addGlobalInterceptor('sentry-logger', sentryInterceptor)`.
    * **Common Scenario 2 (Scoped)**: You have three API clients (`serviceA`, `serviceB`, `payments`). The `payments` client requires a special encryption header, but the others do not. You can create an encryption interceptor and apply it only where needed: `agent.addGlobalInterceptor('encryption', encryptionInterceptor, { clients: ['payments'] })`.

---

## **3. Advanced Feature Modules**

### **3.1. Automatic Token Refresh & Request Queuing**

* **Description**: Orchestrates a seamless, app-wide authentication token refresh flow. When any client receives a `401 Unauthorized` error, the agent pauses all new requests, runs a single refresh function, and then automatically retries the original and all paused requests with the new token.
* **Common Scenario**: A user leaves your app open for an hour, and their authentication token expires. They come back and click a "like" button. The request fails with a `401`. Instead of logging them out, the agent catches this, silently fetches a new token using a refresh token, and then the "like" request is automatically retried and succeeds. The user has no idea anything happened. This is the standard for modern, professional web applications.

### **3.2. Offline Persistence & Replay**

* **Description**: Provides a mechanism to queue "write" requests (POST, PUT, PATCH, DELETE) when the device is offline and automatically send them when connectivity is restored. It uses a user-provided **Adapter** for storage, so it can work with `AsyncStorage`, `MMKV`, `SQLite`, or any other solution.
* **Common Scenario**: A user is on a train and their connection is spotty. They write a comment and press "Post." The agent detects the app is offline, saves the "post comment" request to the device's storage, and the UI immediately shows the comment as "Pending." When the train leaves the tunnel and connectivity is restored, the agent automatically sends the saved request, and the comment is successfully posted.

### **3.3. Intelligent Request Scheduling & Channels**

* **Description**: Provides granular control over network traffic by introducing channels with concurrency limits, pausing, and prioritization.
* **Common Scenario**: Your app needs to sync a large number of files in the background. If you fire 100 requests at once, the UI will become sluggish. Instead, you send them all on a channel configured with a low concurrency: `agent.configureChannels({ backgroundSync: { concurrency: 2 } })`. The agent will then act as a scheduler, ensuring only two file sync requests are active at any given time, preventing network saturation and keeping the UI responsive.

### **3.4. Scoped Request Cancellation**

* **Description**: Allows for canceling groups of related requests via a `scope` tag, without affecting other in-flight requests.
* **Common Scenario**: A user navigates to a complex dashboard screen which fires off 5 different requests to populate various charts and widgets. They quickly navigate away before the requests have finished. In the component's cleanup effect, you call `agent.abortScope('dashboard')`. This instantly cancels all 5 dashboard-related requests, saving bandwidth and preventing React from trying to update state on an unmounted component.

### **3.5. Performance Monitoring & Telemetry**

* **Description**: Gathers and exports network performance metrics (like request latency, retry attempts, etc.) via a user-defined adapter.
* **Common Scenario**: You want to understand how your API is performing for real users. You can create a simple adapter that sends timing data to your analytics service (e.g., Sentry, Datadog). This allows you to create dashboards to answer questions like, "What is the average API response time for users in Brazil?" or "How many times are requests failing and needing to be retried?"

### **3.6. Built-in Mocking Adapter**

* **Description**: Intercepts outgoing requests to return mock data, enabling UI development and testing without a live backend. This entire module should be "tree-shaken" (removed) from a production build.
* **Common Scenario**: The backend team is still building the new `/v2/profile` endpoint, but the frontend team wants to build the new profile screen. The frontend developer can use `agent.mock('get:/v2/profile', { body: { name: 'Mock User' } })`. Now, the `ApiClient` will return this mock data instantly, allowing the entire UI to be built and tested before the API is even ready.
