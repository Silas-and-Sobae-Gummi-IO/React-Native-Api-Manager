# Store Persistence Integration

## Overview

The persistence feature enables the React hook API manager to integrate with external reactive stores (like Zustand, Jotai, Redux, etc.) as the single source of truth for UI data, while maintaining full compatibility with the extensible hook architecture.

## Architecture Goals

1. **Store as Single Source of Truth**: UI data should come from and write to an external store when configured
2. **Reactive UI Updates**: Changes in the store should automatically trigger UI re-renders
3. **Extension Compatibility**: Pagination and other extensions should work seamlessly with or without persistence
4. **Backward Compatibility**: The API should work identically without store configuration
5. **Flexibility**: Support various store libraries with different APIs

## Key Design Decisions

### 1. Dual State Model: `response` vs `result`

**Decision**: Introduce separate `response` and `result` states in `useBaseApi`

**Reasoning**:
- `response`: Raw API response data (always local, never persisted)
- `result`: Transformed/processed UI data (can be store-backed or local)
- This separation allows extensions to transform data without losing the original API response
- Enables persistence of only the UI-relevant data while keeping raw responses ephemeral

**Implementation**:
```javascript
const [response, setResponse] = useState(null);
const [result, setResult] = useState(null);
```

### 2. Dummy Store Pattern

**Decision**: Implement a simple local state-based dummy store in `useBaseApi` by default

**Reasoning**:
- Eliminates conditional branching throughout the codebase
- Extensions can always call `baseApi.updateResult()` regardless of persistence config
- When `usePersist` extension is active, it overrides `updateResult` to use the external store
- Without `usePersist`, the dummy store provides identical behavior using local state
- Simplifies testing and reduces complexity

**Implementation**:
```javascript
// Default dummy store (local state)
const updateResult = useCallback((newResult) => {
  setResult(newResult);
}, []);
```

### 3. Extension Override Pattern

**Decision**: Allow `usePersist` extension to override `baseApi.updateResult` method

**Reasoning**:
- Clean separation of concerns: base API doesn't need to know about stores
- Extensions can modify core behavior without changing base implementation
- Follows the interceptor pattern already established in the architecture
- Easy to test in isolation

**Implementation**:
```javascript
// In usePersist extension
baseApi.updateResult = useCallback((newResult) => {
  store.update(newResult);
}, [store]);
```

### 4. Flexible Store Interface

**Decision**: Support both method-based and callback-based store APIs

**Reasoning**:
- Different store libraries have different APIs
- Some use hooks (Zustand: `useStore`, Jotai: `useAtom`)
- Others use callbacks or selectors
- Configuration should be simple for common cases but extensible for complex ones

**Configuration Options**:

**Method-based (simple)**:
```javascript
persist: {
  dataKey: 'users',
  store: {
    use: useUserStore,        // Hook to read from store
    update: updateUserStore   // Function to write to store
  }
}
```

**Callback-based (flexible)**:
```javascript
persist: {
  dataKey: 'users',
  store: {
    fetch: () => useUserStore((s) => s.users),
    update: (data) => useUserStore.setState({ users: data }),
    fetchMeta: (key) => useUserStore((s) => s.meta[key]),
    updateMeta: (key, value) => useUserStore.setState({ meta: { [key]: value }})
  }
}
```

### 5. Metadata Management

**Decision**: Support optional metadata persistence (e.g., `hasMore`, pagination cursors)

**Reasoning**:
- Some extensions (like pagination) need to persist state beyond just the data array
- Metadata should be store-backed when available, with fallback to local state
- Keeps extensions flexible and store-agnostic

**Implementation**:
```javascript
persist: {
  dataKey: 'users',
  metaKey: 'usersMeta',  // Optional metadata key in store
  store: { /* ... */ },
  defaults: {
    hasMore: true  // Default values for metadata
  }
}
```

### 6. Execution Priority

**Decision**: `usePersist` extension runs with high priority (before pagination)

**Reasoning**:
- Must set up store connection and override `updateResult` before other extensions use it
- Pagination depends on `baseApi.result` being correctly wired to the store
- Early initialization ensures all extensions see the store-backed state

**Implementation**:
```javascript
const builtInExtensions = {
  persist: usePersist,      // Runs first
  pagination: usePagination, // Uses result from persist
  refresh: useRefresh,
  autoFetch: useAutoFetch,
};
```

## Data Flow

### Without Persistence

```
API Request → response state → result state (local) → UI
                    ↓
              Extensions read/modify result
```

### With Persistence

```
API Request → response state → result (from store) → UI
                    ↓                    ↑
              usePersist writes → External Store
                                       ↓
                              Other extensions read
```

## Usage Examples

### Basic Persistence (Zustand)

```javascript
const useUserStore = create((set) => ({
  users: [],
  setUsers: (users) => set({ users })
}));

const { result, loading } = useCoreApi({
  url: '/users',
  persist: {
    dataKey: 'users',
    store: {
      use: () => useUserStore((s) => s.users),
      update: useUserStore.getState().setUsers
    }
  }
});
```

### Persistence with Pagination

```javascript
const { result, loadMore, hasMore } = useCoreApi({
  url: '/users',
  persist: {
    dataKey: 'users',
    metaKey: 'usersMeta',
    store: {
      use: () => useUserStore((s) => s.users),
      update: (data) => useUserStore.setState({ users: data }),
      fetchMeta: (key) => useUserStore((s) => s.meta?.[key]),
      updateMeta: (key, val) => useUserStore.setState((s) => ({
        meta: { ...s.meta, [key]: val }
      }))
    },
    defaults: { hasMore: true }
  },
  pagination: {
    enabled: true,
    pageKey: 'cursor',
    merge: (prev, next) => [...prev, ...next]
  }
});
```

### No Persistence (Default Behavior)

```javascript
const { result, loading } = useCoreApi({
  url: '/users'
});
// result is just local state, works identically
```

## Testing Strategy

1. **Base API Tests**: Verify dummy store behavior (local state)
2. **Persist Extension Tests**: 
   - Store integration with mock stores
   - Metadata sync
   - Override behavior
   - Custom callbacks
3. **Integration Tests**: Pagination + persistence working together
4. **Backward Compatibility**: Ensure existing tests pass without changes

## Benefits

- **Centralized State**: Store becomes the single source of truth
- **Optimistic Updates**: Easy to implement by updating store directly
- **Cross-Component Sync**: Multiple components using the same store stay in sync
- **Offline Support**: Store can persist to AsyncStorage/localStorage
- **DevTools**: External stores often have better debugging tools
- **Performance**: Can leverage store optimizations (selectors, memoization)

## Future Considerations

- Support for optimistic updates via interceptors
- Built-in offline queue integration
- Cache invalidation strategies
- Store migration helpers
- SSR/hydration support
