# ApiAgent Documentation

Central manager for multiple ApiClient instances with shared configuration.

## Quick Start

```js path=null start=null
import { ApiAgent } from './src/agent/ApiAgent';

// Create agent with shared config
const agent = new ApiAgent({
  headers: { 'x-app-version': '1.0' },
  timeout: 5000
});

// Create multiple clients
agent.createClient('api', { baseURL: 'https://api.example.com' });
agent.createClient('cdn', { baseURL: 'https://cdn.example.com' });

// Use clients
const api = agent.getClient('api');
const users = await api.get('/users').send();
```

---

## Why Use ApiAgent?

**Problem:** You have multiple APIs (main API, CDN, auth server) and want to share common config without repeating yourself.

**Solution:** ApiAgent acts as a factory that creates ApiClient instances with shared configuration.

### Without Agent

```js path=null start=null
const apiClient = new ApiClient({
  baseURL: 'https://api.example.com',
  headers: { 'x-app-version': '1.0' },
  interceptors: [LoggerInterceptor],
  timeout: 5000
});

const cdnClient = new ApiClient({
  baseURL: 'https://cdn.example.com',
  headers: { 'x-app-version': '1.0' },  // Repeated
  interceptors: [LoggerInterceptor],    // Repeated
  timeout: 5000                         // Repeated
});
```

### With Agent

```js path=null start=null
const agent = new ApiAgent({
  headers: { 'x-app-version': '1.0' },
  interceptors: [LoggerInterceptor],
  timeout: 5000
});

agent.createClient('api', { baseURL: 'https://api.example.com' });
agent.createClient('cdn', { baseURL: 'https://cdn.example.com' });
```

---

## Configuration

### Shared Config

Applies to all clients created by the agent:

```js path=null start=null
const agent = new ApiAgent({
  // Shared headers
  headers: {
    'x-app-version': '1.0',
    'x-platform': 'mobile'
  },
  
  // Shared interceptors
  interceptors: [
    LoggerInterceptor,
    MetricsInterceptor
  ],
  
  // Shared timeout
  timeout: 5000,
  
  // Shared recovery handlers
  recovery: {
    auth: {
      shouldRetry: (error) => error.status === 401,
      handler: async () => await refreshToken()
    }
  },
  
  // Any other ApiClient config
  debug: true,
  cache: { enable: true, ttl: 60000 }
});
```

### Per-Client Config

Merged with agent config (client config takes precedence):

```js path=null start=null
agent.createClient('api', {
  baseURL: 'https://api.example.com',
  
  // Add client-specific headers
  headers: {
    'x-api-key': 'secret123'
  },
  
  // Override timeout
  timeout: 10000,
  
  // Add client-specific interceptors
  interceptors: [
    RateLimitInterceptor
  ]
});

// Final merged config:
// {
//   baseURL: 'https://api.example.com',
//   headers: { 'x-app-version': '1.0', 'x-platform': 'mobile', 'x-api-key': 'secret123' },
//   timeout: 10000,  // Overridden
//   interceptors: [LoggerInterceptor, MetricsInterceptor, RateLimitInterceptor]
// }
```

---

## Managing Clients

### Create Client

```js path=null start=null
const agent = new ApiAgent();

// Create new client
agent.createClient('api', {
  baseURL: 'https://api.example.com'
});

// Recreate (replaces existing)
agent.createClient('api', {
  baseURL: 'https://api-v2.example.com'
});
```

### Get Client

```js path=null start=null
const api = agent.getClient('api');
await api.get('/users').send();

// Throws if not found
try {
  agent.getClient('nonexistent');
} catch (error) {
  // Error: ApiAgent: No client found with name "nonexistent"
}
```

### Check Existence

```js path=null start=null
if (agent.hasClient('api')) {
  const api = agent.getClient('api');
}
```

### List All Clients

```js path=null start=null
const names = agent.getClientNames();
// ['api', 'cdn', 'auth']
```

### Remove Client

```js path=null start=null
agent.removeClient('api');
// Returns true if removed, false if didn't exist
```

---

## Common Patterns

### Multi-Environment Setup

```js path=null start=null
const agent = new ApiAgent({
  headers: { 'x-app-version': '1.0' },
  interceptors: [LoggerInterceptor]
});

const env = process.env.NODE_ENV;

agent.createClient('api', {
  baseURL: env === 'production' 
    ? 'https://api.example.com'
    : 'https://api-staging.example.com'
});
```

### Separate Auth API

```js path=null start=null
const agent = new ApiAgent({
  timeout: 5000,
  recovery: {
    auth: {
      shouldRetry: (error) => error.status === 401,
      handler: async () => {
        // Refresh token using auth client
        const auth = agent.getClient('auth');
        const { token } = await auth.post('/refresh').send();
        
        // Update all clients
        agent.getClient('api').config.headers.authorization = `Bearer ${token}`;
      }
    }
  }
});

// Main API with auth
agent.createClient('api', {
  baseURL: 'https://api.example.com',
  headers: { authorization: 'Bearer token123' }
});

// Auth API without recovery (avoid infinite loops)
agent.createClient('auth', {
  baseURL: 'https://auth.example.com',
  recovery: { auth: { enable: false } }
});
```

### CDN + API

```js path=null start=null
const agent = new ApiAgent({
  headers: { 'x-app-version': '1.0' }
});

// Fast CDN for static assets
agent.createClient('cdn', {
  baseURL: 'https://cdn.example.com',
  timeout: 2000,
  cache: { enable: true, ttl: 300000 }  // 5 min cache
});

// Regular API
agent.createClient('api', {
  baseURL: 'https://api.example.com',
  timeout: 10000
});

// Usage
const cdn = agent.getClient('cdn');
const avatar = await cdn.get('/avatars/user123.jpg').send();

const api = agent.getClient('api');
const users = await api.get('/users').send();
```

### Dynamic Token Updates

```js path=null start=null
const agent = new ApiAgent({
  headers: { authorization: 'Bearer initial-token' }
});

agent.createClient('api', { baseURL: 'https://api.example.com' });

// Later, when token refreshes
function updateToken(newToken) {
  const api = agent.getClient('api');
  api.config.headers.authorization = `Bearer ${newToken}`;
}
```

---

## Config Merge Rules

### Arrays (Concatenated)

```js path=null start=null
const agent = new ApiAgent({
  interceptors: [LoggerInterceptor]
});

agent.createClient('api', {
  interceptors: [AuthInterceptor, RateLimitInterceptor]
});

// Result: [LoggerInterceptor, AuthInterceptor, RateLimitInterceptor]
```

### Objects (Deep Merged)

```js path=null start=null
const agent = new ApiAgent({
  headers: { 'x-app': 'v1', 'x-platform': 'web' }
});

agent.createClient('api', {
  headers: { 'x-app': 'v2', 'authorization': 'Bearer token' }
});

// Result: { 'x-app': 'v2', 'x-platform': 'web', 'authorization': 'Bearer token' }
```

### Primitives (Client Overwrites)

```js path=null start=null
const agent = new ApiAgent({
  timeout: 5000,
  debug: true
});

agent.createClient('api', {
  timeout: 10000
});

// Result: { timeout: 10000, debug: true }
```

---

## React Native Example

```js path=null start=null
import { ApiAgent } from './src/agent/ApiAgent';
import { Platform } from 'react-native';

const agent = new ApiAgent({
  headers: {
    'x-platform': Platform.OS,
    'x-app-version': '1.0.0'
  },
  interceptors: [LoggerInterceptor],
  recovery: {
    auth: {
      shouldRetry: (error) => error.status === 401,
      handler: async () => {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        const auth = agent.getClient('auth');
        const { token } = await auth.post('/refresh', { refreshToken }).send();
        
        await AsyncStorage.setItem('token', token);
        
        // Update all clients
        const api = agent.getClient('api');
        api.config.headers.authorization = `Bearer ${token}`;
      }
    }
  }
});

// Main API
agent.createClient('api', {
  baseURL: 'https://api.example.com',
  headers: { authorization: `Bearer ${initialToken}` }
});

// Auth API (no recovery)
agent.createClient('auth', {
  baseURL: 'https://auth.example.com',
  recovery: { auth: { enable: false } }
});

// CDN for images
agent.createClient('cdn', {
  baseURL: 'https://cdn.example.com',
  cache: { enable: true, ttl: 600000 }  // 10 min
});

export default agent;
```

---

## Testing

```js path=null start=null
import { ApiAgent } from './src/agent/ApiAgent';

describe('ApiAgent', () => {
  test('creates and retrieves clients', () => {
    const agent = new ApiAgent();
    
    agent.createClient('test', { baseURL: 'https://api.test.com' });
    const client = agent.getClient('test');
    
    expect(client).toBeDefined();
    expect(client.config.baseURL).toBe('https://api.test.com');
  });
  
  test('merges agent and client config', () => {
    const agent = new ApiAgent({
      headers: { 'x-app': 'v1' },
      timeout: 5000
    });
    
    agent.createClient('test', {
      baseURL: 'https://api.test.com',
      headers: { 'authorization': 'Bearer token' },
      timeout: 10000
    });
    
    const client = agent.getClient('test');
    
    expect(client.config.headers['x-app']).toBe('v1');
    expect(client.config.headers.authorization).toBe('Bearer token');
    expect(client.config.timeout).toBe(10000);
  });
});
```

---

## Design Philosophy

**Keep It Simple**

ApiAgent does one thing well: manage multiple clients with shared config. Complex features like:
- Error recovery → RecoveryInterceptor (client-level)
- Request scheduling → SchedulerInterceptor (client-level)
- Offline support → OfflineInterceptor (client-level)

Why? Because client-level interceptors provide:
- More flexibility (per-client control)
- Better tree-shaking (load only what you use)
- Easier testing (isolated units)
- No magic (explicit configuration)

**Agent Coordinates, Interceptors Implement**

Best of both worlds:
- Agent provides central management and shared config
- Interceptors implement cross-cutting concerns
- Users compose exactly what they need

---

*Last Updated: October 2025*
