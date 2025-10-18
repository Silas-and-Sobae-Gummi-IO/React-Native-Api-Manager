import { InterceptorManager } from './InterceptorManager';

describe('InterceptorManager - Manages and executes interceptor pipelines', () => {
  let manager;

  // Create a fresh manager before each test
  beforeEach(() => {
    manager = new InterceptorManager();
  });

  describe('.add() & .remove()', () => {
    it('should add an interceptor and allow it to be removed', () => {
      const interceptor = { onRequest: (config) => config };
      manager.add('test', interceptor, 10);
      expect(manager.interceptors.length).toBe(1);

      manager.remove('test');
      expect(manager.interceptors.length).toBe(0);
    });
  });

  describe('.run()', () => {
    it('should run interceptors in the correct priority order (lower first)', async () => {
      const callOrder = [];
      const interceptorA = {
        onRequest: (config) => {
          callOrder.push('A');
          return config;
        },
      };
      const interceptorB = {
        onRequest: (config) => {
          callOrder.push('B');
          return config;
        },
      };

      manager.add('interceptorB', interceptorB, 20); // Higher priority number, runs later
      manager.add('interceptorA', interceptorA, 10); // Lower priority number, runs first

      await manager.run('onRequest', {});
      expect(callOrder).toEqual(['A', 'B']);
    });

    it('should pass data through the interceptor chain (pipeline)', async () => {
      const initialConfig = { headers: {} };

      const interceptorA = {
        onRequest: (config) => ({
          ...config,
          headers: { ...config.headers, A: 1 },
        }),
      };
      const interceptorB = {
        onRequest: (config) => ({
          ...config,
          headers: { ...config.headers, B: 2 },
        }),
      };

      manager.add('interceptorA', interceptorA, 10);
      manager.add('interceptorB', interceptorB, 20);

      const finalConfig = await manager.run('onRequest', initialConfig);

      expect(finalConfig.headers).toEqual({ A: 1, B: 2 });
    });

    it('should correctly handle asynchronous interceptors', async () => {
      const initialConfig = { headers: {} };

      const asyncInterceptor = {
        onRequest: async (config) => {
          await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async work
          return { ...config, headers: { ...config.headers, auth: 'token' } };
        },
      };

      manager.add('async', asyncInterceptor, 10);

      const finalConfig = await manager.run('onRequest', initialConfig);

      expect(finalConfig.headers.auth).toBe('token');
    });

    it('should only run interceptors that have the specified hook', async () => {
      const onRequest = jest.fn((config) => config);
      const onSuccess = jest.fn((response) => response);

      const interceptor = { onRequest };
      manager.add('test', interceptor, 10);

      await manager.run('onSuccess', {}); // Running 'onSuccess' hook

      expect(onRequest).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled(); // This interceptor doesn't have an onSuccess
    });

    it('should return the initial value if no interceptors are registered for a hook', async () => {
      const initialConfig = { url: '/test' };
      const result = await manager.run('onRequest', initialConfig);
      expect(result).toBe(initialConfig);
    });

    it('should preserve the current value when an interceptor returns undefined (tap)', async () => {
      const initial = { headers: {} };
      manager.add(
        'a',
        { onRequest: (cfg) => ({ ...cfg, headers: { ...cfg.headers, A: 1 } }) },
        10
      );
      // This interceptor does not return a value, acting as a tap
      manager.add('tap', { onRequest: () => undefined }, 15);
      manager.add(
        'b',
        { onRequest: (cfg) => ({ ...cfg, headers: { ...cfg.headers, B: 2 } }) },
        20
      );

      const out = await manager.run('onRequest', initial);
      expect(out.headers).toEqual({ A: 1, B: 2 });
    });
  });
});
