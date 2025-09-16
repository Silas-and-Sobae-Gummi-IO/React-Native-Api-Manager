# @gummi-io/react-native-api-manager

A powerful, modern, and flexible API management library for React and React Native applications. Built with a clean architecture and developer experience in mind, it provides everything you need for robust HTTP client management and state synchronization.

## ✨ Key Features

### 🏗️ **Centralized API Management**
- **Singleton Manager**: Register and manage multiple named API clients for different services
- **Default Client Support**: Set a default client for convenience methods
- **Dynamic Configuration**: Runtime header management and configuration updates

### 🚀 **Modern HTTP Client**
- **Fetch-based**: Built on modern web standards with full TypeScript support
- **RESTful Interface**: Clean methods for `GET`, `POST`, `PUT`, `DELETE`, and file uploads
- **Request/Response Interceptors**: Transform requests and responses globally
- **Automatic JSON Handling**: Smart JSON parsing with fallback error recovery
- **AbortController Integration**: Proper request cancellation and cleanup

### ⚛️ **Powerful React Hooks**
- **`useApiBase`**: Core hook for API state management with loading states
- **`useApiNavigation`**: Navigation-aware wrapper for React Navigation integration
- **`useParallelApi`**: Execute multiple requests concurrently with `Promise.all`
- **`useScreenFocus`**: React Navigation focus/blur event handling

### 🔄 **State Management Integration**
- **Global Store Sync**: Seamless integration with Zustand, Redux, or any state manager
- **Local State Fallback**: Works without global state when needed
- **Automatic State Updates**: Sync API responses to global state automatically

### 🎯 **Smart Request Handling**
- **Lifecycle Awareness**: Auto re-fetch on screen focus with configurable conditions
- **Debounced Requests**: Built-in debouncing for search and parameter changes
- **Pagination Support**: Built-in pagination with merge strategies
- **Error Boundaries**: Structured error handling with custom error types

## 🚀 Installation

```bash
# Using yarn
yarn add @gummi-io/react-native-api-manager
yarn add @react-navigation/native
yarn add zustand # Optional: if using globalStore feature

# Using npm
npm install @gummi-io/react-native-api-manager
npm install @react-navigation/native
npm install zustand # Optional: if using globalStore feature
```

## 🏁 Getting Started: 3-Step Setup

### Step 1: Configure Your API Clients

Create a central file to configure and register all the API clients your app will use.

**`src/services/api.js`**
```javascript
import { apiManager } from '@gummi-io/react-native-api-manager';
import store from './store'; // Example: your global Zustand store

// 1. Register your main application API and set it as the default
apiManager.register(
  'main',
  {
    baseUrl: '[https://api.yourapp.com/v1](https://api.yourapp.com/v1)',
    getDynamicHeaders: async () => {
      const token = store('auth').get('accessToken');
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  },
  true // <-- Set this client as the default
);

// 2. Register a second API for an analytics service
apiManager.register('analytics', {
  baseUrl: '[https://analytics.thirdparty.com](https://analytics.thirdparty.com)',
  headers: { 'X-Api-Key': 'YOUR_ANALYTICS_API_KEY' }
});
```

### Step 2: Create Your Project's Main API Hook

Create a wrapper around `useApiBase` to inject your project's dependencies and handle navigation events automatically.

**`src/hooks/useApi.js`**
```javascript
import { useApiBase, useScreenFocus } from '@gummi-io/react-native-api-manager';
import apiManager from '../services/api';

/**
 * Your project's primary API hook. It automatically injects the default
 * ApiClient and hooks into React Navigation's focus/blur events.
 */
export const useApi = (options = {}) => {
  const client = options.apiManager || apiManager.use();
  const api = useApiBase({ apiManager: client, ...options });

  useScreenFocus({
    onFocus: api.focus,
    onBlur: api.blur,
  });

  return api;
};
```

### Step 3: Use the Hook in Your Components

Now you can use your custom `useApi` hook anywhere in your app.

```javascript
import { useApi } from '../hooks/useApi';

const UserProfile = ({ userId }) => {
  const { response: user, isLoading, error } = useApi({
    uri: `users/${userId}`,
    runOnMount: true,
  });

  if (isLoading) return <ActivityIndicator />;
  if (error) return <Text>Error: {error.message}</Text>;

  return <Text>Welcome, {user.name}!</Text>;
};
```

## 📚 Comprehensive Examples

### Basic CRUD Operations

```javascript
import { useApi } from '@/hooks/useApi';

const TodoManager = () => {
  const [todos, setTodos] = useState([]);
  
  // Fetch todos on mount
  const { response: todoList, isLoading, refresh } = useApi({
    uri: 'todos',
    runOnMount: true,
    onSuccess: (data) => setTodos(data.todos),
  });
  
  // Create new todo
  const { send: createTodo, isLoading: isCreating } = useApi({
    uri: 'todos',
    onSuccess: (newTodo) => {
      setTodos(prev => [...prev, newTodo]);
      refresh(); // Refresh the list
    },
  });
  
  // Delete todo
  const { send: deleteTodo } = useApi({
    uri: 'todos',
    onSuccess: () => refresh(),
  });
  
  const handleCreate = (todoData) => {
    createTodo('initial', todoData);
  };
  
  const handleDelete = (todoId) => {
    deleteTodo('initial', {}, { method: 'DELETE', uri: `todos/${todoId}` });
  };
  
  if (isLoading) return <LoadingSpinner />;
  
  return (
    <View>
      {todos.map(todo => (
        <TodoItem 
          key={todo.id} 
          todo={todo} 
          onDelete={() => handleDelete(todo.id)}
        />
      ))}
      <CreateTodoForm onSubmit={handleCreate} disabled={isCreating} />
    </View>
  );
};
```

### Search with Debouncing

```javascript
import { useApi } from '@/hooks/useApi';

const UserSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const { response: users, isLoading, params, updateParams } = useApi({
    uri: 'users/search',
    initialParams: { query: '', limit: 20 },
    runOnParamsChange: 500, // 500ms debounce
    runOnMount: false,
    validateParams: (params) => params.query.length >= 2,
  });
  
  const handleSearchChange = (text) => {
    setSearchQuery(text);
    updateParams({ query: text, page: 1 });
  };
  
  return (
    <View>
      <TextInput
        value={searchQuery}
        onChangeText={handleSearchChange}
        placeholder="Search users..."
      />
      
      {isLoading && <ActivityIndicator />}
      
      <FlatList
        data={users?.results || []}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <UserListItem user={item} />}
      />
    </View>
  );
};
```

### Pagination with Load More

```javascript
import { useApi } from '@/hooks/useApi';

const InfinitePostList = () => {
  const { 
    response, 
    isLoading, 
    isLoadingMore, 
    hasMore, 
    loadMore 
  } = useApi({
    uri: 'posts',
    runOnMount: true,
    pagination: {
      getResults: (response) => response.posts,
      getMetadata: (response) => ({
        page: response.page,
        hasMore: response.hasNextPage,
        total: response.total,
      }),
      merge: (existing, newResults, page) => {
        if (page === 1) return newResults;
        return [...(existing || []), ...newResults];
      },
    },
  });
  
  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return <ActivityIndicator style={{ padding: 20 }} />;
  };
  
  const handleLoadMore = () => {
    if (hasMore && !isLoadingMore) {
      loadMore();
    }
  };
  
  if (isLoading) return <LoadingSpinner />;
  
  return (
    <FlatList
      data={response?.results || []}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => <PostItem post={item} />}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={renderFooter}
    />
  );
};
```

### Global State Integration (Zustand)

```javascript
// store.js
import { create } from 'zustand';

const useStore = create((set, get) => ({
  user: null,
  posts: [],
  setUser: (user) => set({ user }),
  setPosts: (posts) => set({ posts }),
  // Helper to get nested state
  get: (path) => {
    const state = get();
    return path.split('.').reduce((obj, key) => obj?.[key], state);
  },
  // Helper to update nested state
  update: (path, value) => {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
      if (!obj[key]) obj[key] = {};
      return obj[key];
    }, get());
    target[lastKey] = typeof value === 'function' ? value(target[lastKey]) : value;
    set(get());
  },
}));

// Component with global state sync
const ProfileScreen = ({ userId }) => {
  const { response: profile, isLoading, error } = useApi({
    uri: `users/${userId}`,
    runOnMount: true,
    globalStore: useStore,
    dataPath: 'user', // Automatically sync to store.user
  });
  
  // The response is now automatically synced to global state
  // and will persist across component unmounts
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return <UserProfile user={profile} />;
};
```

### Parallel Requests

```javascript
import { useParallelApi } from '@/hooks/useApi';
import { apiManager } from '@/services/api';

const DashboardScreen = () => {
  const { data, loading, error } = useParallelApi(
    apiManager.use(), // Use default client
    [
      { method: 'get', uri: 'dashboard/stats' },
      { method: 'get', uri: 'dashboard/recent-activity' },
      { method: 'get', uri: 'notifications/unread' },
      { method: 'get', uri: 'user/preferences' },
    ]
  );
  
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorScreen error={error} />;
  
  const [stats, recentActivity, notifications, preferences] = data;
  
  return (
    <ScrollView>
      <StatsWidget data={stats} />
      <RecentActivity data={recentActivity} />
      <NotificationBadge count={notifications.count} />
      <UserPreferences data={preferences} />
    </ScrollView>
  );
};
```

### Advanced Interceptors

```javascript
// api.js - Advanced configuration with interceptors
import { apiManager } from '@gummi-io/react-native-api-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

apiManager.register('main', {
  baseUrl: 'https://api.yourapp.com/v1',
  
  // Dynamic headers function
  getDynamicHeaders: async () => {
    const token = await AsyncStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  
  interceptors: {
    // Transform all requests
    onRequest: async (options, context) => {
      console.log(`Making ${options.method} request to ${context.uri}`);
      
      // Add request timestamp
      if (options.body && typeof options.body === 'string') {
        const body = JSON.parse(options.body);
        body._timestamp = Date.now();
        options.body = JSON.stringify(body);
      }
      
      return; // Continue with request
    },
    
    // Transform all responses
    onResponse: async (data, response) => {
      console.log(`Response ${response.status}:`, data);
      
      // Unwrap nested data structure
      if (data.success && data.data) {
        return data.data;
      }
      
      return data;
    },
    
    // Handle all errors globally
    onError: async (error) => {
      console.error('API Error:', error);
      
      // Handle token expiration
      if (error.status === 401) {
        await AsyncStorage.removeItem('auth_token');
        // Navigate to login screen
        navigationRef.current?.navigate('Login');
        return null; // Return null to prevent further error handling
      }
      
      // Handle rate limiting
      if (error.status === 429) {
        return { error: 'Too many requests. Please try again later.' };
      }
      
      throw error; // Re-throw for component to handle
    },
    
    // Always run after request (success or failure)
    onFinally: async () => {
      // Log request completion, update analytics, etc.
      console.log('Request completed');
    },
  },
}, true); // Set as default
```

## 📚 API Reference

### ApiManager

The singleton manager for all your API clients.

```javascript
import { apiManager } from '@gummi-io/react-native-api-manager';

// Register clients
apiManager.register(name, config, isDefault)
apiManager.use(name?) // Get client by name or default
apiManager.isRegistered(name) // Check if client exists
apiManager.getDefaultClientName() // Get default client name
apiManager.getRegisteredClientNames() // Get all client names

// Proxy methods (use default client)
apiManager.get(uri, params, options)
apiManager.post(uri, body, options)
apiManager.put(uri, body, options)
apiManager.del(uri, options)
apiManager.upload(uri, data, options)
apiManager.all(requests) // Parallel requests
```

### ApiClient

Individual HTTP client with full REST interface.

```javascript
import { createApiClient } from '@gummi-io/react-native-api-manager';

const client = createApiClient({
  baseUrl: 'https://api.example.com',
  headers: { 'X-API-Key': 'your-key' },
  getDynamicHeaders: async () => ({ /* dynamic headers */ }),
  interceptors: { /* request/response interceptors */ },
});

// HTTP methods
client.get(uri, params, options)
client.post(uri, body, options)
client.put(uri, body, options)
client.del(uri, options)
client.upload(uri, formData, options)
client.request(uri, options) // Generic request

// Parallel requests
client.all([{ method, uri, ...options }])

// Control
client.abort() // Cancel current requests
client.setHeader(key, value) // Set dynamic header
client.unsetHeader(key) // Remove dynamic header
client.clearHeaders() // Clear all dynamic headers
```

### Hooks

#### useApiBase(options)

Core hook for API state management.

```javascript
const {
  response,        // API response data
  error,          // Error object if request failed
  params,         // Current parameters
  isLoading,      // Any loading state
  isInitialLoading, // First load
  isRefreshing,   // Manual refresh
  isLoadingMore,  // Pagination loading
  hasMore,        // Has more pages (pagination)
  
  // Actions
  send,           // Manual request trigger
  refresh,        // Refresh current data
  loadMore,       // Load next page
  setParams,      // Set parameters
  updateParams,   // Update parameters (merge)
  handleOnChange, // Form input helper
  focus,          // Focus event handler
  blur,           // Blur event handler
} = useApiBase({
  apiManager,     // Required: API client instance
  uri: '',        // API endpoint
  
  // Parameters
  initialParams: {},
  params: undefined, // Controlled params
  
  // Behavior
  runOnMount: false,
  alwaysRunOnMount: false,
  runOnFocus: false, // or 'once' or number (seconds)
  runOnParamsChange: false, // or number (debounce ms)
  
  // State management
  globalStore: null,    // Global state store
  dataPath: '',         // Path in global store
  
  // Request lifecycle
  validateParams: (params) => true,
  filterParams: (params) => params,
  filterResponse: (data) => data,
  
  // Event handlers
  onSubmit: async () => {},
  onSuccess: async (data, params) => {},
  onError: async (error) => {},
  onCompleted: async () => {},
  onRefresh: async () => {},
  
  // Pagination
  pagination: {
    getResults: (response) => response.data,
    getMetadata: (response) => ({ 
      page: response.page,
      hasMore: response.hasMore 
    }),
    merge: (existing, newResults, page) => {
      return page === 1 ? newResults : [...existing, ...newResults];
    },
  },
  
  // Control
  abortOnUnmount: true,
  abortOnBlur: true,
  refreshDependencies: [], // Re-fetch when dependencies change
});
```

#### useApiNavigation(options)

Navigation-aware wrapper that integrates with React Navigation.

```javascript
const api = useApiNavigation({
  // Same options as useApiBase
  // Automatically handles focus/blur events
});
```

#### useParallelApi(apiClient, requests)

Execute multiple requests in parallel.

```javascript
const { data, loading, error } = useParallelApi(
  apiClient,
  [
    { method: 'get', uri: '/endpoint1' },
    { method: 'post', uri: '/endpoint2', body: { data: 'test' } },
  ]
);
```

#### useScreenFocus({ onFocus, onBlur })

Safe React Navigation focus/blur event handling.

```javascript
useScreenFocus({
  onFocus: () => console.log('Screen focused'),
  onBlur: () => console.log('Screen blurred'),
});
```
