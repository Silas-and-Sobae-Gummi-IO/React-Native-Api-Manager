# ApiAgent

Central manager for multiple ApiClient instances with shared configuration and interceptors.

## Philosophy

**Declarative & Immutable** - Configure once in constructor, then create clients. No dynamic config updates.

## Basic Usage

```js
import {ApiAgent} from './agent';
import {AuthInterceptor, LoggingInterceptor} from './interceptors';

// 1. Create agent with flat config (just like ApiClient)
const agent = new ApiAgent({
  timeout: 5000,
  headers: {
    'x-app-version': '1.0.0'
  },
  interceptors: [
    AuthInterceptor,
    LoggingInterceptor
  ]
});

// 2. Create clients (inherit global config + interceptors)
agent.createClient('api', {
  baseURL: 'https://api.example.com'
});

agent.createClient('cdn', {
  baseURL: 'https://cdn.example.com'
});

// 3. Use clients
const api = agent.getClient('api');
const users = await api.get('/users').send();
```

## API

### Constructor

```js
new ApiAgent(config)
```

**config** - Flat config object, same as ApiClient:
- `timeout` - Request timeout
- `headers` - Default headers
- `interceptors` - Array of interceptor classes
- `hooks` - Hook definitions
- Any other ApiClient config options

### Methods

**createClient(name, config)**
- Creates named client with merged config (global + client)
- Returns: ApiClient instance

**getClient(name)**
- Retrieves client by name
- Throws if not found

**hasClient(name)**
- Check if client exists
- Returns: boolean

**getClientNames()**
- List all client names
- Returns: string[]

**removeClient(name)**
- Remove client from agent
- Returns: boolean

## Config Merging

Client-specific config **overrides** agent config:

```js
const agent = new ApiAgent({
  timeout: 3000,
  headers: {'x-app-name': 'my-app'}
});

const client = agent.createClient('api', {
  timeout: 5000,  // Overrides agent
  headers: {'x-api-version': '1.0'},
  baseURL: 'https://api.example.com'
});

// Result (deep merged):
// - timeout: 5000 (client override)
// - headers: {'x-app-name': 'my-app', 'x-api-version': '1.0'} (merged)
// - baseURL: 'https://api.example.com' (client specific)
```

## Interceptor Merging

Global interceptors are **prepended** to client interceptors:

```js
const agent = new ApiAgent({
  interceptors: [AuthInterceptor, LoggingInterceptor]
});

// Client gets both global interceptors
const api = agent.createClient('api');

// Client can add more
const special = agent.createClient('special', {
  interceptors: [CacheInterceptor]
});
// special has: Auth, Logging, Cache

// Client can remove global interceptors
const noAuth = agent.createClient('public', {
  interceptors: ['-auth']  // Remove AuthInterceptor
});
// public has: Logging only
```

## Common Patterns

### Multi-Tenant

```js
const agent = new ApiAgent({
  headers: {'x-app-id': 'my-app'},
  interceptors: [AuthInterceptor]
});

agent.createClient('api', {
  baseURL: 'https://api.example.com'
});

agent.createClient('cdn', {
  baseURL: 'https://cdn.example.com',
  interceptors: ['-auth']  // CDN doesn't need auth
});
```

### Environment-Specific

```js
const apiUrl = process.env.API_URL;
const cdnUrl = process.env.CDN_URL;

const agent = new ApiAgent({
  timeout: 5000,
  debug: process.env.DEBUG === 'true',
  interceptors: [AuthInterceptor]
});

agent.createClient('api', {baseURL: apiUrl});
agent.createClient('cdn', {baseURL: cdnUrl});
```

### Testing

```js
// Production
const prodAgent = new ApiAgent({
  baseURL: 'https://api.example.com',
  interceptors: [AuthInterceptor]
});

// Testing (no auth, mock responses)
const testAgent = new ApiAgent({
  baseURL: 'http://localhost:3000',
  interceptors: [MockInterceptor]
});
```

## Why No Dynamic Updates?

**Predictable** - Config is set once at initialization
**Simple** - No need to track state changes
**Safe** - Prevents accidental config mutations
**Testable** - Easy to reason about behavior

If you need different config, create a new agent:

```js
// Old agent
const oldAgent = new ApiAgent({timeout: 3000});

// New requirements? Create new agent
const newAgent = new ApiAgent({timeout: 5000});
```

## Files

- `ApiAgent.js` - Main class with deep merge logic
- `ApiAgent.test.js` - Tests (16 passing)
- `example.js` - Usage examples
- `index.js` - Exports

## Next Steps

Add features as needed:
- Auth refresh handler (conditional retrier)
- Request scheduler (channels, priorities)
- Additional advanced features
