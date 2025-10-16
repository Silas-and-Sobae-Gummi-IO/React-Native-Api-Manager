# ApiManager Documentation

The `ApiManager` is a singleton that creates, stores, and manages all of your app's `ApiClient` instances. It's the perfect solution for apps that need to connect to multiple APIs, like a primary backend and a separate analytics service.

## ✨ Features

- **Singleton Registry**: A single, central place to manage all your API configurations.
- **Named Clients**: Register each `ApiClient` with a unique name (e.g., `'main'`, `'payments'`) for easy retrieval.
- **Default Client**: Designate one client as the default for convenience.
- **Proxy Shortcuts**: Call methods like `apiManager.get(...)` directly on the manager as a shortcut for the default client's methods.

## 🚀 Setup & Usage

The `ApiManager` is designed to be configured once when your application starts up.

### Step 1: Create a Central API Configuration File

This is where you'll define all the API clients your app needs.

**`src/services/api.js`**

```javascript
import {createApiClient, apiManager} from 'your-library-name';
import store from './store'; // Example: your global store

// 1. Register your main application API and set it as the default
apiManager.register(
  'main',
  {
    baseUrl: '[https://api.yourapp.com/v1](https://api.yourapp.com/v1)',
    getDynamicHeaders: async () => {
      const token = store('auth').get('accessToken');
      return token ? {Authorization: `Bearer ${token}`} : {};
    },
  },
  true, // <-- Set this client as the default
);

// 2. Register a second, separate API for an analytics service
apiManager.register('analytics', {
  baseUrl: '[https://analytics.thirdparty.com](https://analytics.thirdparty.com)',
  headers: {'X-Api-Key': 'YOUR_ANALYTICS_API_KEY'},
});
```

### Step 2: Use the Manager in Your App

Once configured, you can import the `apiManager` anywhere to get the client you need.

**Using the Default Client:**

The manager acts as a proxy, so you can call methods directly on it.

```javascript
import apiManager from '../services/api';

// This call is automatically sent to the 'main' (default) client
const user = await apiManager.get('users/me');
```

**Using a Named Client:**

Use the `.use()` method to get a specific client instance.

```javascript
import apiManager from '../services/api';

const analyticsClient = apiManager.use('analytics');

analyticsClient.post('events', {type: 'app_open'});
```

## 📚 API Reference

### Management Methods

#### `apiManager.register(name, config, isDefault?)`

Creates and registers a new `ApiClient` instance.

- **`name`** (string): A unique name for the client (e.g., `'main'`).
- **`config`** (object): The configuration object passed directly to `createApiClient`.
- **`isDefault`** (boolean, optional): If `true`, sets this client as the default. Defaults to `false`. Throws an error if a default is already set.

#### `apiManager.use(name?)`

Retrieves a registered `ApiClient` instance.

- **`name`** (string, optional): The name of the client to retrieve. If omitted, it returns the client marked as the default.

#### `apiManager.isRegistered(name)`

Checks if a client with a given name has been registered.

- **`name`** (string): The name of the client to check.

### Proxy Methods

The `apiManager` object itself exposes all the same methods as an `ApiClient` instance:

- `apiManager.get(...)`
- `apiManager.post(...)`
- `apiManager.put(...)`
- `apiManager.del(...)`
- `apiManager.upload(...)`
- `apiManager.all(...)`
- `apiManager.request(...)`
- `apiManager.setHeader(...)`
- `apiManager.abort()`
- And others...

Calling any of these methods on the `apiManager` is a shortcut that forwards the call to the **default** registered client. An error will be thrown if you try to use a proxy method without having registered a default client.
