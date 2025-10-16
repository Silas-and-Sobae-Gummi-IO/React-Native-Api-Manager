# **Project Introduction: The Nexus API Suite**

Welcome, AI Agent. This document is your master guide to the "Nexus API Suite," a comprehensive, modern library for handling API communications in a JavaScript/React Native application.

The suite is composed of three distinct but interconnected layers:

1.  **`ApiClient` (The Foundation)**: A powerful, standalone client for sending HTTP requests. It's the engine that handles the low-level mechanics of communication, including interceptors, retries, and error handling. It is framework-agnostic.

2.  **`ApiAgent` (The Command Center)**: A high-level service layer that manages all `ApiClient` instances. It acts as a central hub for application-wide concerns like authentication, offline support, request scheduling, and global configuration.

3.  **React Hooks (The UI Bridge)**: A single, unified `useApi` hook that provides a declarative, easy-to-use bridge between your React components and the API service layer. It handles all the complexities of data fetching, caching, and state management within the React ecosystem.

### **File Directory**

To understand a specific part of the library, refer to the following specification and development plan documents:

  * **For the low-level request client:**

      * `spec-api-client.md`: The detailed technical specification for the `ApiClient`.
      * `tdd-plan-api-client.md`: The step-by-step TDD plan for building the `ApiClient`.

  * **For the high-level application service layer:**

      * `spec-api-agent.md`: The detailed technical specification for the `ApiAgent`.
      * `tdd-plan-api-agent.md`: The step-by-step TDD plan for building the `ApiAgent`.

  * **For the React integration layer:**

      * `spec-react-hooks.md`: The detailed technical specification for the unified `useApi` hook.
      * `tdd-plan-react-hooks.md`: The step-by-step TDD plan for building the React hooks.
