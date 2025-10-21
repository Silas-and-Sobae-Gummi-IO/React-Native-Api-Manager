// Example usage of ApiAgent

import {ApiAgent} from './ApiAgent';
import {BaseInterceptor} from '../client/interceptors/BaseInterceptor';

// ============================================
// 1. DEFINE INTERCEPTORS
// ============================================

// Auth interceptor that applies to all clients
class AuthInterceptor extends BaseInterceptor {
  static name = 'auth';
  
  register() {
    this._manager.add('request:prepareConfig', 'auth:inject', (config) => {
      // Only add auth to non-CDN requests
      if (!config.baseURL?.includes('cdn')) {
        return {
          ...config,
          headers: {
            ...config.headers,
            authorization: `Bearer ${this._getToken()}`
          }
        };
      }
      return config;
    });
  }
  
  _getToken() {
    // Get from storage, state, etc.
    return 'current-user-token';
  }
}

// Logging interceptor
class LoggingInterceptor extends BaseInterceptor {
  static name = 'logging';
  
  register() {
    this._manager.add('request:beforeRequest', 'log:request', (context) => {
      console.log(`[Request] ${context.config.method} ${context.url}`);
    });
    
    this._manager.add('request:onResponse', 'log:response', (context) => {
      console.log(`[Response] ${context.config.method} ${context.url} - ${context.response?.status}`);
    });
  }
}

// Metrics interceptor
class MetricsInterceptor extends BaseInterceptor {
  static name = 'metrics';
  
  register() {
    this._manager.add('request:beforeRequest', 'metrics:start', (context) => {
      context.context.startTime = Date.now();
    });
    
    this._manager.add('request:complete', 'metrics:end', (context) => {
      const duration = Date.now() - context.context.startTime;
      console.log(`[Metrics] ${context.config.method} ${context.url} - ${duration}ms`);
    });
  }
}

// ============================================
// 2. CREATE AGENT (flat config)
// ============================================

const agent = new ApiAgent({
  timeout: 5000,
  headers: {
    'x-app-version': '1.0.0',
    'x-platform': 'mobile'
  },
  interceptors: [
    AuthInterceptor,
    LoggingInterceptor,
    MetricsInterceptor
  ]
});

// ============================================
// 3. CREATE CLIENTS
// ============================================

// Main API client
agent.createClient('api', {
  baseURL: 'https://api.example.com',
  headers: {
    'x-api-key': 'secret'
  }
});

// CDN client for assets (without auth interceptor)
agent.createClient('cdn', {
  baseURL: 'https://cdn.example.com'
});

// Admin API with different auth
agent.createClient('admin', {
  baseURL: 'https://admin.example.com',
  headers: {
    authorization: 'Bearer admin-token'
  }
});

// ============================================
// 4. USE CLIENTS
// ============================================

async function fetchData() {
  const api = agent.getClient('api');
  const cdn = agent.getClient('cdn');
  
  // All requests have global config + client config merged
  const users = await api.get('/users').send();
  const avatar = await cdn.get('/avatars/user1.png').send();
  
  return {users, avatar};
}

// ============================================
// 5. CLIENT-SPECIFIC INTERCEPTORS
// ============================================

// Create a client with additional interceptor
class CacheInterceptor extends BaseInterceptor {
  static name = 'cache';
  register() {
    // Custom caching logic
  }
}

agent.createClient('cached-api', {
  baseURL: 'https://api.example.com',
  interceptors: [CacheInterceptor] // Added to global interceptors
});

// ============================================
// 6. UTILITY METHODS
// ============================================

console.log('Registered clients:', agent.getClientNames());
// ['api', 'cdn', 'admin', 'cached-api']

console.log('Has CDN client?', agent.hasClient('cdn'));
// true

// Remove a client
agent.removeClient('admin');

export default agent;
