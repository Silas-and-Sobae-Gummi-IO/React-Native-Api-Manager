# **Technical Specification: The `useApi` Hook Suite**

## **1. Overview & Core Philosophy**

`useApi` is a single, comprehensive React hook designed to handle the entire lifecycle of an API interaction. It serves as a unified entry point for fetching, mutating, and managing server state. Its primary goal is to make data fetching declarative, robust, and simple, abstracting away the complexities of caching, state synchronization, and race conditions.

The hook is powered by a **zero-config, global cache** that operates behind the scenes. This intentional design choice **eliminates the need for a `<Provider>` wrapper**, making setup effortless. The hook intelligently adapts its behavior and return values based on a single configuration object, allowing it to function as a query, mutation, or infinite query hook while maintaining a simple and consistent API.

-----

## **2. The Unified `useApi` Hook**

This is the only hook the end-user will need to import and use.

### **Function Signature**

```javascript
useApi(config)
```

  * **`config`**: A single configuration object that defines the hook's behavior. The properties within this object determine which "mode" the hook will operate in.

-----

## **3. Modes of Operation**

The `useApi` hook intelligently dispatches to one of the following internal modes based on the `config` object.

### **A) Query Mode (Default)**

This is the primary mode for fetching and caching "read" operations (GET requests). It's the workhorse for displaying any server data in your UI.

  * **Activation**: This mode is activated when the `config` object contains a `queryKey` and a `queryFn`.
  * **Use Case**: Fetching a user's profile, a list of products, or configuration settings. Any time you need to "read" data and show it.
  * **Example Config**:
    ```javascript
    const { data, isLoading } = useApi({
      queryKey: ['user', userId],
      queryFn: () => apiClient.get(`/users/${userId}`),
    });
    ```
  * **Returned State & Methods**:
      * `data`, `error`
      * `isLoading`: `boolean` - True only on the initial fetch when no cached data exists. Useful for showing a full-screen skeleton loader.
      * `isFetching`: `boolean` - True whenever a request is in-flight, including background refetches. Useful for showing a subtle loading spinner in a corner.
      * `isSuccess`, `isError`: `boolean`
      * `refetch`: A function to manually trigger a refetch.

### **B) Mutation Mode**

This mode is for performing "write" operations (POST, PUT, PATCH, DELETE). It's designed for actions, not for displaying data.

  * **Activation**: This mode is activated when the `config` object contains a `mutationFn`. It **never** runs automatically.
  * **Use Case**: Submitting a form, deleting a todo item, liking a post. Any action that a user takes to change data on the server.
  * **Example Config**:
    ```javascript
    const { mutate, isLoading } = useApi({
      mutationFn: (newTodo) => apiClient.post('/todos', newTodo),
      // After success, invalidate the 'todos' query to refetch the list
      onSuccess: () => agent.invalidateQueries(['todos']),
    });

    const handleSubmit = () => mutate({ title: 'A new todo' });
    ```
  * **Returned State & Methods**:
      * `mutate`: The function you call to trigger the mutation.
      * `isLoading`, `isSuccess`, `isError`
      * `data`: The data returned from the mutation's response.
      * `error`

### **C) Infinite Query Mode**

A specialized version of Query Mode for "infinite scroll" or "load more" UIs.

  * **Activation**: When `config` contains a `queryKey`, `queryFn`, and a `getNextPageParam` function.
  * **Use Case**: Displaying long, paginated lists like a social media feed, a product catalog, or a chat history.
  * **Example Config**:
    ```javascript
    const { data, fetchNextPage, hasNextPage, isLoadingMore } = useApi({
      queryKey: ['projects'],
      queryFn: ({ pageParam = 1 }) => apiClient.get(`/projects?page=${pageParam}`),
      getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    });
    ```
  * **Returned State & Methods**:
      * All returns from Query Mode, plus:
      * `data`: An object `{ pages: [], pageParams: [] }` containing all fetched pages.
      * `fetchNextPage`: A function to fetch the next page.
      * `hasNextPage`: `boolean` - True if there is more data to load.
      * `isLoadingMore`: `boolean` - True only while `fetchNextPage` is running.

-----

## **4. Universal Configuration Options**

These options can be used in any mode to control behavior.

### **General**

  * `enabled`: `boolean`

      * **Description**: If `false`, a query will not run automatically.
      * **Common Scenario**: For **dependent queries**. You need to fetch a user's profile, and *only after* you have their `userId`, you fetch their posts. The posts query would have `enabled: !!user.id`.

  * `onSuccess(data, variables?)` / `onError(error, variables?)`

      * **Description**: Side-effect callbacks that fire after a query or mutation completes.
      * **Common Scenario**: Showing a success toast notification after a form submission: `onSuccess: () => toast.success('Profile updated!')`.

  * `debug`: `boolean`

      * **Description**: If `true`, logs the hook's entire lifecycle (`fetching`, `success`, `using cache`, `error`, etc.) to the console.
      * **Common Scenario**: A query is re-fetching more often than you expect. You turn on `debug: true` to see a step-by-step log in the console that tells you exactly why the hook is making its decisions.

### **Caching & Synchronization (Primarily for Query Mode)**

  * `staleTime`: `number` (Default: `0`)

      * **Description**: The time in `ms` before fetched data is considered "stale." If a component mounts and its data in the cache is not stale, no network request will be made.
      * **Common Scenario**: You have data that doesn't change very often, like a list of countries. You set `staleTime: 600000` (10 minutes). Now, when a user navigates to the country list screen, the data loads **instantly** from the cache. The app feels incredibly fast because it's not waiting for the network.

  * `cacheTime`: `number` (Default: `300000` - 5 mins)

      * **Description**: The time in `ms` an *inactive* query's data is kept in the cache before being garbage collected.
      * **Common Scenario**: A user navigates away from a screen. The `cacheTime` is the grace period during which, if they navigate back, the data will still be there for an instant load.

  * `refetchOnFocus`: `boolean` (Default: `true`)

      * **Description**: Automatically refetches the data for this query when the app screen comes into focus.
      * **Common Scenario**: A user opens your app, checks their messages, then switches to another app. While they are away, a new message arrives. When they switch back to your app, `refetchOnFocus` automatically triggers a fresh fetch of their messages, ensuring the UI is always up-to-date without needing to pull-to-refresh.

  * `keepPreviousData`: `boolean` (Default: `false`)

      * **Description**: If `true`, the `data` from the last successful fetch will be preserved while a new request is in flight.
      * **Common Scenario**: This solves the jarring **UI flash**. A user is viewing a list of products, then clicks a "Sort by Price" button. Without this option, the list would disappear for a moment while the sorted list is loading. With `keepPreviousData: true`, the old list remains visible (you can style it as "stale" using the `isFetching` flag) until the new data arrives, creating a smooth transition.

  * `select`: `(data) => any`

      * **Description**: A function to transform or select a part of the data. The component will only re-render if the selected/transformed value changes.
      * **Common Scenario**: This is a powerful **performance optimization**. A query returns a huge user object, but your component only displays the user's name. You use `select: (data) => data.name`. Now, if something else in the user object (like `lastLoginAt`) updates in the background, your component will not needlessly re-render because the name it selected hasn't changed.

-----

## **5. Automatic "Magical" Features (Zero-Config)**

These powerful features are built-in and work automatically to make your application more robust.

  * **Response Staleness Protection**

      * **Description**: The hook internally tracks the latest request. If an older request's response arrives *after* a newer one has already been processed, the hook simply ignores the outdated data.
      * **The Problem It Solves**: It prevents **race conditions**. Without it, a fast typist in a search bar could see results for "react" flicker and be replaced by results for "re" if the network responses arrive out of order. This feature makes that bug impossible.

  * **Request Deduplication**

      * **Description**: If multiple components request the exact same `queryKey` at nearly the same time, the hook is smart enough to only send **one** network request. All components will receive the data from that single request.
      * **The Problem It Solves**: It prevents wastefully sending identical network requests. If three `<Avatar userId={123} />` components appear on screen, you'll only make one API call to `/users/123`, not three. It's like a smart barista making one batch of coffee for three identical orders.

-----

## **6. Global API Methods (on the `ApiAgent`)**

These methods on the `ApiAgent` are the bridge that allows your mutations to communicate with your queries.

  * **`agent.invalidateQueries(queryKey)`**

      * **Description**: Marks all queries matching the `queryKey` as stale and triggers an immediate refetch for all active `useApi` hooks subscribed to them.
      * **Common Scenario**: This is the most common and important pattern. After a `useApi` mutation to create a new todo succeeds, you call `agent.invalidateQueries(['todos'])`. This tells every `useApi` hook in your app that is displaying the list of todos to automatically refetch itself, ensuring the new todo appears everywhere.

  * **`agent.setQueryData(queryKey, data)`**

      * **Description**: Allows you to manually and instantly update the cached data for a query from anywhere, bypassing a network request.
      * **Common Scenario**: For **optimistic updates**. When a user likes a post, you can call `agent.setQueryData(...)` immediately to update the UI to show the "liked" state *before* the network request even completes. If the request then fails, you can roll back the change in the `onError` callback. This makes the UI feel instantaneous.
