# React Hooks - Technical Specification

## Current Implementation Status

✅ **Phase 1A: Core (useBaseApi)** - COMPLETE
- Manual request manager with reactive data state
- No auto-fetch, no caching (keeping it simple)
- ~176 lines

🔄 **In Progress:**
- Testing useBaseApi

📋 **TODO Extensions (in order):**
1. Pagination extension (infinite scroll, load more)
2. Refresh extension (pull-to-refresh)
3. Auto-fetch extension (fetch on mount with `enabled`)
4. Caching extension (optional global store integration)

---

## Core Philosophy

`useApi` is a **manual request manager** that handles API request lifecycle with reactive data state. Unlike React Query, it does NOT auto-fetch or cache by default. Instead:

- **Base hook** - Simple request state manager
- **Extensions** - Opt-in features (pagination, refresh, caching)
- **Manual control** - User triggers requests explicitly
- **Composable** - Extensions add state and methods via their own hooks

---

## Current API

### useBaseApi (Internal)

**Location:** `src/hooks/useBaseApi.js`

**Config:**
```js
{
  client: ApiClient,        // Required
  url: string,              // 'GET:/posts' or '/posts'
  initialData: object,      // Initial data state
  onSuccess: (response) => void,
  onError: (error) => void
}
```

**Returns:**
```js
{
  // State (reactive)
  data: object,             // Form/request data
  response: object|null,    // Last API response
  error: Error|null,        // Last error
  isLoading: boolean,       // Request in flight
  
  // Methods
  send: (overrides?) => Promise,     // Trigger request
  updateData: (key, value) => void,  // Update single field
  setData: (newData) => void,        // Replace entire data
  reset: () => void                  // Reset to initialData
}
```

### useCoreApi / useApi (Public)

**Location:** `src/hooks/useCoreApi.js`

Wraps `useBaseApi` and conditionally applies extensions. Same API as base + extensions.

---

## Usage Examples

### Basic Request

```js
const api = useApi({
  client: apiClient,
  url: 'GET:/posts',
  initialData: { category: 'tech' }
});

// Manual trigger
const handleFetch = async () => {
  try {
    const response = await api.send();
    console.log(response);
  } catch (error) {
    console.error(api.error);
  }
};
```

### Form with Reactive Data

```jsx
const api = useApi({
  client: apiClient,
  url: 'POST:/users',
  initialData: { name: '', email: '' }
});

return (
  <>
    <TextInput 
      value={api.data.name}
      onChange={(text) => api.updateData('name', text)}
    />
    <TextInput 
      value={api.data.email}
      onChange={(text) => api.updateData('email', text)}
    />
    
    <Button 
      onPress={() => api.send()} 
      disabled={api.isLoading}
    >
      {api.isLoading ? 'Saving...' : 'Submit'}
    </Button>
  </>
);
```

---

## TODO: Planned Extensions

### 1. Pagination Extension (Phase 1B)

**Priority:** HIGH - Most common use case

**Config:**
```js
const api = useApi({
  client,
  url: 'GET:/posts',
  initialData: { page: 1 },
  pagination: {
    hasMoreFn: (response) => response.hasMore  // Determine if more pages
  }
});
```

**Additional Returns:**
```js
{
  results: [],              // Accumulated results
  hasMore: boolean,         // Has next page
  isLoadingMore: boolean,   // Loading state for loadMore()
  loadMore: () => Promise,  // Load next page (increments data.page, appends to results)
  resetPagination: () => void  // Clear results, reset page
}
```

**Use Cases:**
- Infinite scroll (FlatList onEndReached)
- Load more button
- Cursor-based pagination (not just page numbers)

---

### 2. Refresh Extension (Phase 1C)

**Priority:** HIGH - Pull-to-refresh is standard

**Config:**
```js
const api = useApi({
  client,
  url: 'GET:/posts',
  refresh: true
});
```

**Additional Returns:**
```js
{
  isRefreshing: boolean,    // Separate from isLoading
  refresh: () => Promise    // Reset + send
}
```

**Use Cases:**
- FlatList refreshControl
- Pull-to-refresh gesture
- Manual refresh button

---

### 3. Auto-Fetch Extension (Phase 2)

**Priority:** MEDIUM - Convenience feature

**Config:**
```js
const api = useApi({
  client,
  url: 'GET:/posts',
  autoFetch: true,          // Fetch on mount
  enabled: !!userId,        // Conditional fetching
  refetchOnFocus: true      // Refetch on window focus
});
```

**Additional State:**
```js
{
  isInitialLoading: boolean  // First ever fetch
}
```

---

### 4. Caching Extension (Phase 2+)

**Priority:** LOW - Advanced feature

**Features:**
- Global cache with queryKey
- Stale-while-revalidate
- Request deduplication
- Cache invalidation
- Optional store integration (Zustand, Redux, etc.)

**Config:**
```js
const api = useApi({
  client,
  url: 'GET:/posts',
  queryKey: ['posts', filters],
  staleTime: 60000,
  cacheTime: 300000
});
```

---

### 5. Race Condition Protection (Future)

**Priority:** MEDIUM - Quality of life

**Feature:** Track request IDs, ignore stale responses

**Use Case:** Fast typing in search bar

---

### 6. Debug Extension (Future)

**Priority:** LOW - Developer experience

**Config:**
```js
const api = useApi({
  client,
  url: 'GET:/posts',
  debug: true  // Console logs lifecycle
});
```

---

## Implementation Notes

**Extension Architecture:**
- Each extension is its own hook with its own state
- Extensions receive core API and enhance it
- Extensions are opt-in via config
- Extensions compose via object spread

**File Structure:**
```
src/hooks/
  useBaseApi.js          # Core (~176 lines)
  useCoreApi.js          # Orchestrator (~30 lines)
  extensions/
    pagination.js        # ~80 lines
    refresh.js           # ~40 lines
    autoFetch.js         # Future
    caching.js           # Future
```

**Testing Strategy:**
- Test base hook in isolation
- Test each extension in isolation
- Test composition (base + extensions)

---

*Last Updated: October 2025*
