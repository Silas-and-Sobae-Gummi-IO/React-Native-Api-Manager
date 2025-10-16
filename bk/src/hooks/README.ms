# useApiBase Hook Documentation

The `useApiBase` hook is the foundational, library-agnostic hook for handling all API request lifecycles within a React component. It is designed to be highly configurable and can be wrapped by project-specific hooks (like `useApiNavigation`) to provide default configurations.

## ✨ Features

-   **Complete Lifecycle Management**: Manages all states of an API request: loading, refreshing, success, and error.
-   **Declarative Fetching**: Trigger API calls based on component mount, screen focus, or changes in parameters or external state.
-   **Controlled & Uncontrolled Modes**: Can manage its own `params` state internally or be "controlled" by passing a `params` prop from parent state.
-   **Built-in Debouncing**: Automatically debounces requests when parameters change, perfect for search inputs.
-   **Global State Synchronization**: Optionally syncs response data with a global state manager like Zustand, keeping your app's data consistent.
-   **Pagination Support**: Built-in logic to handle paginated APIs, including `loadMore` functionality and state tracking.
-   **Abort Handling**: Automatically aborts requests on component unmount to prevent memory leaks and race conditions.

## 📚 API Reference

### `useApiBase(options)`

#### Options

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| **`apiManager`** | `object` | | **Required.** An instance of an `ApiClient` created by `createApiClient`. |
| **`uri`** | `string` | `''` | The API endpoint URI (e.g., `users/123`). |
| **`params`** | `object` | `undefined` | A "controlled" set of parameters for the request. If provided, the hook will sync its internal params to this prop. |
| **`initialParams`** | `object` | `{}` | The default parameters for the request. Used to initialize the internal state if `params` is not provided. |
| **`runOnMount`** | `boolean` | `false` | If `true`, runs the request when the component mounts. If `globalStore` is used, it only runs if data is missing. |
| **`alwaysRunOnMount`**| `boolean`| `false` | If `true`, forces `runOnMount` to execute even if data exists in the `globalStore`. |
| **`runOnFocus`** | `boolean \| 'once' \| number` | `false` | `true`: runs on every focus. `'once'`: runs only on the first focus. `number`: runs on focus *only if* it has been more than that many **seconds** since the last successful fetch. |
| **`runOnParamsChange`**| `boolean \| number` | `false` | If `true`, re-runs the request when `params` change. If a `number`, it **debounces** the request by that many milliseconds. |
| **`refreshDependencies`** | `Array` | `[]` | An array of external dependencies. A change in any value will trigger a `refresh()`. |
| **`globalStore`** | `object` | `null` | An instance of your global store manager (e.g., Zustand). Must have `use`, `get`, and `update` methods. |
| **`dataPath`** | `string` | `''` | **Required if `globalStore` is used.** A dot-notation path to read/write data within the `globalStore`. |
| **`pagination`** | `object` | `null` | A configuration object to enable pagination. See Pagination section below. |

---

### Return Values

| Key | Type | Description |
| :--- | :--- | :--- |
| **`response`** | `any` | The data returned from the API. If using `globalStore`, this value is subscribed directly from the store. |
| **`error`** | `ApiError` | An `ApiError` instance if the request fails, otherwise `null`. |
| **`params`** | `object` | The current parameters of the request. |
| **`isLoading`** | `boolean` | A general flag, `true` if any request is in flight. |
| **`isInitialLoading`**| `boolean` | `true` only for the very first request. |
| **`isRefreshing`** | `boolean` | `true` when `refresh()` is called. |
| **`isLoadingMore`** | `boolean` | `true` when `loadMore()` is called (pagination). |
| **`send`** | `(params) => Promise<any>` | Manually trigger the request with optional one-time params. |
| **`refresh`** | `() => Promise<any>` | Manually trigger a refresh of the data. |
| **`loadMore`** | `() => void` | (Pagination Mode) Fetches the next page of results. |
| **`updateParams`**| `(updates) => void` | Merge an object into the current `params` to update them. |
| **`focus`** / **`blur`** | `() => void` | Methods to be called by a navigation lifecycle hook (like `useScreenFocus`). |

---

## 💡 Usage Examples

### 1. Simple Data Fetching

```javascript
const { response: user, isLoading } = useApiBase({
  apiManager: apiClient,
  uri: 'users/1',
  runOnMount: true,
});
```

### 2. Debounced Search

This example shows how `runOnParamsChange` with a number enables debouncing.

```javascript
const [searchTerm, setSearchTerm] = useState('');

const { response: results, isLoading } = useApiBase({
  apiManager: apiClient,
  uri: 'search',
  params: { query: searchTerm }, // Controlled params
  runOnParamsChange: 500, // Debounce requests by 500ms
});
```

### 3. Syncing with a Global Store

Keep a user's profile globally consistent.

```javascript
const { response: user } = useApiBase({
  apiManager: apiClient,
  uri: `users/${userId}`,
  runOnMount: true,
  globalStore: store('entities'), // Your Zustand store instance
  dataPath: `users.${userId}`,   // Where to store the user data
});
```

### 4. Reacting to External State

Refresh a user's posts whenever the `userId` prop changes.

```javascript
const { response: posts } = useApiBase({
  apiManager: apiClient,
  uri: `users/${userId}/posts`,
  runOnMount: true,
  refreshDependencies: [userId], // Re-fetches when userId changes
});
```

### 5. Pagination

The `pagination` option requires a config object with three functions.

-   **`getResults(apiResponse)`**: Extracts the array of items from the full API response.
-   **`getMetadata(apiResponse)`**: Extracts pagination metadata, like `hasMore`.
-   **`merge(oldResults, newResults, page)`**: Defines how to combine old and new results.

```javascript
const { response, isLoadingMore, loadMore } = useApiBase({
  apiManager: apiClient,
  uri: 'feed',
  runOnMount: true,
  pagination: {
    getResults: (res) => res.data,
    getMetadata: (res) => ({
      hasMore: res.pagination.has_more,
      page: res.pagination.current_page,
    }),
    merge: (oldResults, newResults, page) => {
      return page === 1 ? newResults : [...(oldResults || []), ...newResults];
    },
  },
});

// In your UI:
// <FlatList
//   data={response?.results || []}
//   onEndReached={loadMore}
//   ListFooterComponent={isLoadingMore && <ActivityIndicator />}
// />
```
