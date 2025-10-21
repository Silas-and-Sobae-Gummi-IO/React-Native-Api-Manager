import {ApiAgent} from './ApiAgent';
import {ApiClient} from '../client/ApiClient';
import {BaseInterceptor} from '../client/interceptors/BaseInterceptor';

describe('ApiAgent', () => {
  let agent;

  beforeEach(() => {
    agent = new ApiAgent();
  });

  describe('Constructor', () => {
    test('creates agent with empty config', () => {
      const agent = new ApiAgent();
      expect(agent.config).toEqual({});
    });

    test('creates agent with flat config', () => {
      const agent = new ApiAgent({
        timeout: 5000,
        headers: {'x-app': 'test'}
      });
      
      expect(agent.config.timeout).toBe(5000);
      expect(agent.config.headers['x-app']).toBe('test');
    });

    test('creates agent with interceptors in config', () => {
      class TestInterceptor extends BaseInterceptor {
        static name = 'test';
        register() {}
      }

      const agent = new ApiAgent({
        interceptors: [TestInterceptor]
      });
      
      expect(agent.config.interceptors).toEqual([TestInterceptor]);
    });
  });

  describe('Client Management', () => {
    test('creates and retrieves clients', () => {
      const client = agent.createClient('test', {baseURL: 'https://api.test.com'});
      
      expect(client).toBeInstanceOf(ApiClient);
      expect(agent.getClient('test')).toBe(client);
    });

    test('throws when getting non-existent client', () => {
      expect(() => agent.getClient('missing')).toThrow('No client found');
    });

    test('hasClient returns correct status', () => {
      expect(agent.hasClient('test')).toBe(false);
      
      agent.createClient('test');
      expect(agent.hasClient('test')).toBe(true);
    });


    test('removes clients', () => {
      agent.createClient('test');
      expect(agent.hasClient('test')).toBe(true);
      
      agent.removeClient('test');
      expect(agent.hasClient('test')).toBe(false);
    });

    test('lists client names', () => {
      agent.createClient('api');
      agent.createClient('cdn');
      agent.createClient('admin');
      
      const names = agent.getClientNames();
      expect(names).toEqual(['api', 'cdn', 'admin']);
    });
  });

  describe('Config Merging', () => {
    test('applies agent config to clients', () => {
      const agent = new ApiAgent({
        timeout: 3000,
        headers: {'x-app': 'test'}
      });

      const client = agent.createClient('test', {
        baseURL: 'https://api.test.com'
      });

      expect(client.config.timeout).toBe(3000);
      expect(client.config.headers['x-app']).toBe('test');
      expect(client.config.baseURL).toBe('https://api.test.com');
    });

    test('client config overrides agent config', () => {
      const agent = new ApiAgent({timeout: 3000});
      
      const client = agent.createClient('test', {timeout: 5000});
      expect(client.config.timeout).toBe(5000);
    });

    test('deep merges headers', () => {
      const agent = new ApiAgent({
        headers: {'x-app-name': 'my-app'}
      });
      
      const client = agent.createClient('test', {
        headers: {'x-app-version': '1.1.1'}
      });
      
      expect(client.config.headers['x-app-name']).toBe('my-app');
      expect(client.config.headers['x-app-version']).toBe('1.1.1');
    });

    test('concatenates interceptors arrays', () => {
      class Interceptor1 extends BaseInterceptor {
        static name = 'int1';
        register() {}
      }
      class Interceptor2 extends BaseInterceptor {
        static name = 'int2';
        register() {}
      }

      const agent = new ApiAgent({
        interceptors: [Interceptor1]
      });
      
      const client = agent.createClient('test', {
        interceptors: [Interceptor2]
      });
      
      // Both interceptors should be attached
      expect(client.interceptors.providers.has('int1')).toBe(true);
      expect(client.interceptors.providers.has('int2')).toBe(true);
    });
  });

  describe('Interceptors', () => {
    class TestInterceptor extends BaseInterceptor {
      static name = 'test';
      
      register() {
        this._manager.add('request:prepareConfig', 'test:hook', (config) => {
          return {...config, _testApplied: true};
        });
      }
    }

    test('applies agent interceptors to all clients', () => {
      const agent = new ApiAgent({
        interceptors: [TestInterceptor]
      });
      
      const client1 = agent.createClient('test1');
      const client2 = agent.createClient('test2');
      
      // Both clients should have the test interceptor
      expect(client1.interceptors.providers.has('test')).toBe(true);
      expect(client2.interceptors.providers.has('test')).toBe(true);
    });

    test('client can add additional interceptors', () => {
      class ClientInterceptor extends BaseInterceptor {
        static name = 'client';
        register() {}
      }

      const agent = new ApiAgent({
        interceptors: [TestInterceptor]
      });
      
      const client = agent.createClient('test', {
        interceptors: [ClientInterceptor]
      });
      
      // Should have both agent and client interceptors
      expect(client.interceptors.providers.has('test')).toBe(true);
      expect(client.interceptors.providers.has('client')).toBe(true);
    });

    test('client can remove agent interceptors with minus syntax', () => {
      const agent = new ApiAgent({
        interceptors: [TestInterceptor]
      });
      
      const client = agent.createClient('test', {
        interceptors: ['-test']
      });
      
      // Agent interceptor should be removed
      expect(client.interceptors.providers.has('test')).toBe(false);
    });
  });

  describe('Integration', () => {
    test('full workflow: config + interceptors + clients', () => {
      // Create agent with flat config including interceptors
      class AuthInterceptor extends BaseInterceptor {
        static name = 'auth';
        register() {
          this._manager.add('request:prepareConfig', 'auth:inject', (config) => config);
        }
      }

      const agent = new ApiAgent({
        timeout: 3000,
        headers: {'x-app-name': 'my-app'},
        interceptors: [AuthInterceptor]
      });

      // Create clients with merged config
      const api = agent.createClient('api', {
        baseURL: 'https://api.test.com',
        headers: {'x-api-version': '1.0'}
      });
      
      const cdn = agent.createClient('cdn', {
        baseURL: 'https://cdn.test.com',
        timeout: 10000, // Override
        headers: {'x-cdn-version': '2.0'}
      });

      // Verify deep merge
      expect(api.config.timeout).toBe(3000);
      expect(api.config.headers['x-app-name']).toBe('my-app');
      expect(api.config.headers['x-api-version']).toBe('1.0');
      expect(api.config.baseURL).toBe('https://api.test.com');
      
      expect(cdn.config.timeout).toBe(10000); // Overridden
      expect(cdn.config.headers['x-app-name']).toBe('my-app');
      expect(cdn.config.headers['x-cdn-version']).toBe('2.0');

      // Verify interceptor applied to both
      expect(api.interceptors.providers.has('auth')).toBe(true);
      expect(cdn.interceptors.providers.has('auth')).toBe(true);
    });
  });
});
