# **TDD Plan: The `useApi` Hook**

### **Phase 1: The Global Cache (The Brain 🧠)**

This is a non-React class that will manage all query states. We'll test its logic in complete isolation from React to ensure the core mechanics are solid.

* `[ ]` **Setup**: Create a `cache.js` file and its corresponding `cache.test.js`.

* `[ ]` **Test 1 (Core Operations)**: Write a test to ensure you can `set`, `get`, and `delete` a query from the cache using a `queryKey`. A query object should contain `data`, `status`, `lastUpdated` timestamp, etc.

* `[ ]` **Test 2 (Subscription Model)**: Write a test for a `subscribe` method. It should take a `queryKey` and a callback. When the data for that key is updated via `set`, the callback should be invoked with the new query state. Crucially, test that the unsubscribe function returned by `subscribe` correctly removes the listener.

* `[ ]` **Test 3 (Garbage Collection)**: Use Jest's fake timers (`jest.useFakeTimers()`).
    * Set a query in the cache.
    * Advance the timers past the `cacheTime`.
    * Assert that the query has been automatically removed from the cache because it had no active subscribers.

* `[ ]` **Implementation**: Build the `QueryCache` class to make all tests pass.

---

### **Phase 2: The Core Query Logic (`useInternalQuery`)**

This internal hook will contain the main logic for fetching data. You'll need a library like `@testing-library/react-hooks` or `@testing-library/react` to render and test the hook.

* `[ ]` **Setup**: Create a `useInternalQuery.js` file and its test file. Set up a mock `ApiClient` and instantiate the global `QueryCache`.

* `[ ]` **Test 1 (Basic Fetching)**: Test the full lifecycle. The hook should initially return `{ isLoading: true }`, then call the `queryFn`, and finally return `{ isSuccess: true, data: '...' }` on a successful response.

* `[ ]` **Test 2 (Error State)**: Test that if the `queryFn` promise rejects, the hook returns `{ isError: true, error: '...' }`.

* `[ ]` **Test 3 (Caching & `staleTime`)**:
    * Render the hook once and let it succeed.
    * Unmount and re-render the same hook immediately with `staleTime: 60000` (1 minute).
    * Assert that data is returned instantly from the cache and that the `queryFn` is **not** called again.
    * Advance timers past the `staleTime` and re-render. Assert the `queryFn` is now called.

* `[ ]` **Test 4 (Deduplication)**: Render two instances of the hook with the same `queryKey` at the same time. Assert that the `queryFn` is only called **once**.

* `[ ]` **Test 5 (Advanced Features)**:
    * `[ ]` **`enabled: false`**: Test that if `enabled` is `false`, the `queryFn` is not called on mount.
    * `[ ]` **`refetch` function**: Test that calling the returned `refetch` function triggers the `queryFn` again.
    * `[ ]` **`keepPreviousData`**: Let a query for `key: ['items', 1]` succeed. Re-render with `key: ['items', 2]` and `keepPreviousData: true`. Assert that while `isFetching` is true, the `data` property still holds the data from the first request.
    * `[ ]` **`select`**: Provide a `select: (data) => data.name` function. Assert that the hook's return value is just the name, not the full data object.

* `[ ]` **Implementation**: Build the `useInternalQuery` hook, making it interact with the global `QueryCache`.

---

### **Phase 3: The Action Logic (`useInternalMutation`)**

This hook is simpler as it doesn't involve caching or automatic execution.

* `[ ]` **Setup**: Create `useInternalMutation.js` and its test file.

* `[ ]` **Test 1 (Manual Trigger)**: Test that the hook does **not** call the `mutationFn` on mount.

* `[ ]` **Test 2 (`mutate` function)**: Test that calling the returned `mutate(variables)` function triggers the `mutationFn` with the correct `variables`.

* `[ ]` **Test 3 (State Transitions)**: Test that the hook returns `{ isLoading: true }` after `mutate` is called, and then `{ isSuccess: true, data: '...' }` on success or `{ isError: true }` on failure.

* `[ ]` **Test 4 (Callbacks)**: Test that the `onSuccess`, `onError`, and `onMutate` callbacks are fired at the correct times with the correct arguments.

* `[ ]` **Implementation**: Build the `useInternalMutation` hook.

---

### **Phase 4: The Unified `useApi` Hook (The Dispatcher)**

This is the public-facing hook. These tests are simple and focus on ensuring it correctly delegates to the internal hooks.

* `[ ]` **Setup**: Create `useApi.js` and its test file. You'll mock the internal hooks.

* `[ ]` **Test 1 (Query Mode Dispatch)**: Call `useApi` with a `config` object containing `queryKey` and `queryFn`. Assert that `useInternalQuery` was called with the correct config.

* `[ ]` **Test 2 (Mutation Mode Dispatch)**: Call `useApi` with a `config` object containing a `mutationFn`. Assert that `useInternalMutation` was called.

* `[ ]` **Test 3 (Infinite Query Mode Dispatch)**: Call `useApi` with `queryKey`, `queryFn`, and `getNextPageParam`. Assert that the internal infinite query hook was called.

* `[ ]` **Implementation**: Write the `useApi` hook. It will be a thin wrapper that analyzes the `config` object and calls the appropriate internal hook.

---

### **Phase 5: `ApiAgent` & Global Cache Integration**

This final phase connects the non-React `ApiAgent` to the React-based cache, closing the loop.

* `[ ]` **Setup**: You'll be adding methods to your existing `ApiAgent` class and testing their effects on a rendered `useApi` hook in `ApiAgent.test.js`.

* `[ ]` **Test 1 (`agent.invalidateQueries`)**:
    * Render a `useApi` query hook and let it succeed, populating the cache.
    * Call `agent.invalidateQueries(['your-key'])` from outside the hook.
    * Assert that the active hook automatically starts a refetch (its `isFetching` state becomes true).

* `[ ]` **Test 2 (`agent.setQueryData`)**:
    * Render a `useApi` query hook.
    * Call `agent.setQueryData(['your-key'], 'new optimistic data')` from outside the hook.
    * Assert that the hook's `data` immediately updates to the new value *without* a network request.

* `[ ]` **Implementation**: Add the `invalidateQueries` and `setQueryData` methods to your `ApiAgent` class. These methods will directly call the public methods on the global `QueryCache` instance from Phase 1.
