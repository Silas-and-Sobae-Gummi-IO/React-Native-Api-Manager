# ApiAgent - AI Technical Spec

Central manager for multiple ApiClient instances with shared configuration.

## Overview

ApiAgent manages multiple named ApiClient instances, providing:
- Shared configuration inheritance (headers, interceptors, etc.)
- Deep config merging (agent config < client config)
- Named client registry

**Design Philosophy:** Keep it simple. Complex features (recovery, scheduling, offline) live as client-level interceptors for flexibility.

---

## Core API

**Constructor:**
```js
new ApiAgent(config?)
```
- `config` - Shared config inherited by all clients (headers, interceptors, etc.)

**Methods:**
- `createClient(name, config)` - Create/recreate named client with merged config
- `getClient(name)` - Get client by name (throws if not found)
- `hasClient(name)` - Check if client exists
- `getClientNames()` - Get array of all client names
- `removeClient(name)` - Remove client from registry

---

## Config Merging

Deep merge: agent config < client config

**Arrays (interceptors):** Concatenated
```js
agent: { interceptors: [A, B] }
client: { interceptors: [C] }
result: [A, B, C]
```

**Objects (headers):** Merged
```js
agent: { headers: { 'x-app': 'v1' } }
client: { headers: { 'x-client': 'v2' } }
result: { 'x-app': 'v1', 'x-client': 'v2' }
```

**Primitives:** Client overwrites
```js
agent: { timeout: 5000 }
client: { timeout: 3000 }
result: 3000
```

---

## Usage Patterns

**Multi-API Setup:**
```js
const agent = new ApiAgent({
  headers: { 'x-app-version': '1.0' },
  interceptors: [LoggerInterceptor],
  recovery: {
    auth: {
      shouldRetry: (error) => error.status === 401,
      handler: async () => await refreshToken()
    }
  }
});

agent.createClient('api', { baseURL: 'https://api.example.com' });
agent.createClient('cdn', { baseURL: 'https://cdn.example.com' });
agent.createClient('auth', { 
  baseURL: 'https://auth.example.com',
  recovery: { auth: { enable: false } }  // No auth refresh for auth API
});
```

**Token Updates:**
```js
const api = agent.getClient('api');
api.config.headers.authorization = `Bearer ${newToken}`;
```

---

## Testing

- 17 tests passing
- Framework: Jest

---

## Design Rationale

**Why Simple?**
- Complex features (scheduling, offline, recovery) work better as client-level interceptors
- Per-client control vs. global magic
- Tree-shakeable - users only load what they use
- Testable - each interceptor is isolated

**Agent Coordinates, Interceptors Implement**
- Agent manages multiple clients with shared config
- Interceptors implement cross-cutting concerns
- Best of both worlds: central management + flexible implementation

---

*For usage examples, see `.ai/docs/api-agent.md`*
