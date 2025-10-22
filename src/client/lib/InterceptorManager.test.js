// src/client/internals/InterceptorManager.test.js

import {InterceptorManager} from './InterceptorManager';
import {BaseInterceptor} from '../interceptors/BaseInterceptor';

// Mock interceptor classes for testing
class MockInterceptor1 extends BaseInterceptor {
  register() {
    this._manager.add('test:hook', () => 'mock1', 10, 'mock1:action');
  }
}

class MockInterceptor2 extends BaseInterceptor {
  register() {
    this._manager.add('test:hook', () => 'mock2', 20, 'mock2:action');
  }
}

class InvalidInterceptor {
  // Does not extend BaseInterceptor
  register() {}
}

describe('InterceptorManager', () => {
  let manager;
  let mockClient;

  beforeEach(() => {
    mockClient = {config: {}, interceptors: null};
    manager = new InterceptorManager(mockClient);
  });

  describe('Initialization', () => {
    it('initializes with empty hooks and providers', () => {
      expect(manager.hooks.size).toBe(0);
      expect(manager.providers.size).toBe(0);
    });

    it('stores reference to client', () => {
      expect(manager.client).toBe(mockClient);
    });
  });

  describe('add() - Adding individual hooks', () => {
    it('adds a hook with default priority', () => {
      const callback = jest.fn();
      manager.add('test:hook', callback, 10, 'my-hook');

      const hooks = manager.hooks.get('test:hook');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toEqual({
        name: 'my-hook',
        callback,
        priority: 10,
        _provider: null, // No provider context when adding hooks manually
      });
    });

    it('adds a hook with custom priority', () => {
      const callback = jest.fn();
      manager.add('test:hook', callback, 5, 'my-hook');

      const hooks = manager.hooks.get('test:hook');
      expect(hooks[0].priority).toBe(5);
    });

    it('sorts hooks by priority in ascending order', () => {
      manager.add('test:hook', jest.fn(), 20, 'low');
      manager.add('test:hook', jest.fn(), 5, 'high');
      manager.add('test:hook', jest.fn(), 10, 'medium');

      const hooks = manager.hooks.get('test:hook');
      expect(hooks[0].name).toBe('high');
      expect(hooks[1].name).toBe('medium');
      expect(hooks[2].name).toBe('low');
    });

    it('preserves insertion order for hooks with same priority', () => {
      manager.add('test:hook', jest.fn(), 10, 'first');
      manager.add('test:hook', jest.fn(), 10, 'second');
      manager.add('test:hook', jest.fn(), 10, 'third');

      const hooks = manager.hooks.get('test:hook');
      expect(hooks[0].name).toBe('first');
      expect(hooks[1].name).toBe('second');
      expect(hooks[2].name).toBe('third');
    });

    it('allows multiple hooks on the same hookName', () => {
      manager.add('test:hook', jest.fn(), 10, 'hook1');
      manager.add('test:hook', jest.fn(), 10, 'hook2');

      const hooks = manager.hooks.get('test:hook');
      expect(hooks).toHaveLength(2);
    });
  });

  describe('remove() - Removing individual hooks', () => {
    it('removes a hook by name', () => {
      manager.add('test:hook', jest.fn(), 10, 'hook1');
      manager.add('test:hook', jest.fn(), 10, 'hook2');

      manager.remove('test:hook', 'hook1');

      const hooks = manager.hooks.get('test:hook');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('hook2');
    });

    it('handles removal of non-existent hook gracefully', () => {
      manager.add('test:hook', jest.fn(), 10, 'hook1');

      expect(() => {
        manager.remove('test:hook', 'non-existent');
      }).not.toThrow();

      const hooks = manager.hooks.get('test:hook');
      expect(hooks).toHaveLength(1);
    });

    it('handles removal from non-existent hookName gracefully', () => {
      expect(() => {
        manager.remove('non-existent:hook', 'hook1');
      }).not.toThrow();
    });
  });

  describe('attach() - Attaching class-based interceptors', () => {
    it('attaches an interceptor and calls its init method', () => {
      const instance = manager.attach(MockInterceptor1);

      expect(instance).toBeInstanceOf(MockInterceptor1);
      expect(manager.providers.has('MockInterceptor1')).toBe(true);
    });

    it('passes manager and client to interceptor init', () => {
      const instance = manager.attach(MockInterceptor1);

      expect(instance._manager).toBe(manager);
      expect(instance._client).toBe(mockClient);
    });

    it('calls the interceptor register method during init', () => {
      manager.attach(MockInterceptor1);

      const hooks = manager.hooks.get('test:hook');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('mock1:action');
    });

    it('tracks provider ownership on hooks registered during init', () => {
      manager.attach(MockInterceptor1);

      const hooks = manager.hooks.get('test:hook');
      expect(hooks[0]._provider).toBe('MockInterceptor1');
    });

    it('sets _provider to null for manually added hooks', () => {
      manager.add('custom:hook', jest.fn(), 10, 'manual-hook');

      const hooks = manager.hooks.get('custom:hook');
      expect(hooks[0]._provider).toBeNull();
    });

    it('uses static name property if available', () => {
      class NamedInterceptor extends BaseInterceptor {
        static name = 'custom-name';
        register() {}
      }

      manager.attach(NamedInterceptor);

      expect(manager.providers.has('custom-name')).toBe(true);
    });

    it('allows explicit name override', () => {
      manager.attach(MockInterceptor1, 'override-name');

      expect(manager.providers.has('override-name')).toBe(true);
      expect(manager.providers.has('MockInterceptor1')).toBe(false);
    });

    it('returns existing instance if provider already attached', () => {
      const instance1 = manager.attach(MockInterceptor1);
      const instance2 = manager.attach(MockInterceptor1);

      expect(instance1).toBe(instance2);
      expect(manager.providers.size).toBe(1);
    });

    it('throws error if provider is not a class', () => {
      expect(() => {
        manager.attach('not-a-class');
      }).toThrow('Invalid provider');
    });

    it('throws error if provider does not extend BaseInterceptor', () => {
      expect(() => {
        manager.attach(InvalidInterceptor);
      }).toThrow('must extend BaseInterceptor');
    });

    it('throws error for anonymous provider without explicit name', () => {
      const AnonymousClass = class extends BaseInterceptor {
        register() {}
      };
      // Remove the name property to simulate anonymous
      Object.defineProperty(AnonymousClass, 'name', {value: ''});

      expect(() => {
        manager.attach(AnonymousClass);
      }).toThrow('Anonymous providers must be attached with an explicit name');
    });

    it('throws error if interceptor name starts with shorthand prefix', () => {
      class BadInterceptor1 extends BaseInterceptor {
        static name = '-invalid';
        register() {}
      }
      class BadInterceptor2 extends BaseInterceptor {
        static name = '+invalid';
        register() {}
      }
      class BadInterceptor3 extends BaseInterceptor {
        static name = '~invalid';
        register() {}
      }

      expect(() => manager.attach(BadInterceptor1)).toThrow('cannot start with');
      expect(() => manager.attach(BadInterceptor2)).toThrow('cannot start with');
      expect(() => manager.attach(BadInterceptor3)).toThrow('cannot start with');
    });
  });

  describe('detach() - Detaching interceptors', () => {
    it('removes provider and all its hooks', () => {
      manager.attach(MockInterceptor1);

      expect(manager.providers.has('MockInterceptor1')).toBe(true);
      expect(manager.hooks.get('test:hook')).toHaveLength(1);

      manager.detach('MockInterceptor1');

      expect(manager.providers.has('MockInterceptor1')).toBe(false);
      expect(manager.hooks.get('test:hook')).toHaveLength(0);
    });

    it('removes only hooks owned by the provider, not manually added hooks', () => {
      manager.attach(MockInterceptor1); // Adds hook with _provider='MockInterceptor1'
      manager.add('test:hook', jest.fn(), 10, 'custom:action'); // Adds hook with _provider=null

      manager.detach('MockInterceptor1');

      const hooks = manager.hooks.get('test:hook');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('custom:action');
      expect(hooks[0]._provider).toBeNull(); // Verify it's the manual hook that remains
    });

    it('handles detaching non-existent provider gracefully', () => {
      expect(() => {
        manager.detach('non-existent');
      }).not.toThrow();
    });

    it('cleans up hooks from multiple hookNames', () => {
      class MultiHookInterceptor extends BaseInterceptor {
        static name = 'multi';
        register() {
          this._manager.add('hook1', jest.fn(), 10, 'multi:action1');
          this._manager.add('hook2', jest.fn(), 10, 'multi:action2');
        }
      }

      manager.attach(MultiHookInterceptor);
      expect(manager.hooks.get('hook1')).toHaveLength(1);
      expect(manager.hooks.get('hook2')).toHaveLength(1);

      manager.detach('multi');
      expect(manager.hooks.get('hook1')).toHaveLength(0);
      expect(manager.hooks.get('hook2')).toHaveLength(0);
    });
  });

  describe('run() - Executing hook chains', () => {
    it('executes hooks in priority order', async () => {
      const execution = [];
      manager.add('test:hook', () => execution.push(1), 5, 'first');
      manager.add('test:hook', () => execution.push(2), 10, 'second');
      manager.add('test:hook', () => execution.push(3), 15, 'third');

      await manager.run('test:hook');

      expect(execution).toEqual([1, 2, 3]);
    });

    it('passes initial value through hook chain', async () => {
      manager.add('test:hook', (val) => val + 1, 10, 'hook1');
      manager.add('test:hook', (val) => val * 2, 10, 'hook2');

      const result = await manager.run('test:hook', 5);

      expect(result).toBe(12); // (5 + 1) * 2
    });

    it('passes context to hooks when value is undefined', async () => {
      const mockCallback = jest.fn((ctx) => ctx.foo);
      manager.add('test:hook', mockCallback, 10, 'hook1');

      await manager.run('test:hook', undefined, {foo: 'bar'});

      expect(mockCallback).toHaveBeenCalledWith({foo: 'bar'});
    });

    it('passes both value and context when value is defined', async () => {
      const mockCallback = jest.fn((val, ctx) => val + ctx.increment);
      manager.add('test:hook', mockCallback, 10, 'hook1');

      const result = await manager.run('test:hook', 10, {increment: 5});

      expect(mockCallback).toHaveBeenCalledWith(10, {increment: 5});
      expect(result).toBe(15);
    });

    it('skips hook if callback returns undefined', async () => {
      manager.add('test:hook', () => undefined, 10, 'hook1');
      manager.add('test:hook', (val) => val + 10, 10, 'hook2');

      const result = await manager.run('test:hook', 5);

      expect(result).toBe(15); // First hook didn't transform, second added 10
    });

    it('handles async hook callbacks', async () => {
      manager.add(
        'test:hook',
        async (val) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return val + 1;
        },
        10,
        'async'
      );

      const result = await manager.run('test:hook', 5);

      expect(result).toBe(6);
    });

    it('returns initial value if no hooks registered', async () => {
      const result = await manager.run('non-existent:hook', 42);

      expect(result).toBe(42);
    });

    it('returns undefined for undefined value with no hooks', async () => {
      const result = await manager.run('non-existent:hook');

      expect(result).toBeUndefined();
    });
  });

  describe('processInterceptors() - Batch attach/detach', () => {
    it('attaches multiple interceptor classes', () => {
      manager.processInterceptors([MockInterceptor1, MockInterceptor2]);

      expect(manager.providers.has('MockInterceptor1')).toBe(true);
      expect(manager.providers.has('MockInterceptor2')).toBe(true);
    });

    it('detaches providers using "-name" syntax', () => {
      manager.attach(MockInterceptor1);
      manager.attach(MockInterceptor2);

      manager.processInterceptors(['-MockInterceptor1']);

      expect(manager.providers.has('MockInterceptor1')).toBe(false);
      expect(manager.providers.has('MockInterceptor2')).toBe(true);
    });

    it('handles mixed attach and detach operations', () => {
      manager.attach(MockInterceptor1);

      class MockInterceptor3 extends BaseInterceptor {
        register() {}
      }

      manager.processInterceptors(['-MockInterceptor1', MockInterceptor2, MockInterceptor3]);

      expect(manager.providers.has('MockInterceptor1')).toBe(false);
      expect(manager.providers.has('MockInterceptor2')).toBe(true);
      expect(manager.providers.has('MockInterceptor3')).toBe(true);
    });

    it('handles empty array gracefully', () => {
      expect(() => {
        manager.processInterceptors([]);
      }).not.toThrow();
    });

    it('does not affect existing providers when processing empty array', () => {
      manager.attach(MockInterceptor1);
      manager.attach(MockInterceptor2);

      manager.processInterceptors([]);

      expect(manager.providers.has('MockInterceptor1')).toBe(true);
      expect(manager.providers.has('MockInterceptor2')).toBe(true);
    });

    it('ignores invalid entries', () => {
      manager.processInterceptors([MockInterceptor1, null, undefined, MockInterceptor2]);

      expect(manager.providers.has('MockInterceptor1')).toBe(true);
      expect(manager.providers.has('MockInterceptor2')).toBe(true);
    });

    it('allows detaching non-existent providers without error', () => {
      expect(() => {
        manager.processInterceptors(['-non-existent']);
      }).not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('manages complex hook chains with multiple providers', async () => {
      class Interceptor1 extends BaseInterceptor {
        register() {
          this._manager.add('request:prepare', (val) => val + 1, 5, 'i1:prepare');
        }
      }

      class Interceptor2 extends BaseInterceptor {
        register() {
          this._manager.add('request:prepare', (val) => val * 2, 10, 'i2:prepare');
        }
      }

      manager.attach(Interceptor1);
      manager.attach(Interceptor2);

      const result = await manager.run('request:prepare', 5);

      expect(result).toBe(12); // (5 + 1) * 2
    });

    it('properly interleaves manual hooks with provider hooks by priority', async () => {
      class Interceptor1 extends BaseInterceptor {
        register() {
          this._manager.add('request:prepare', (val) => val + 1, 5, 'i1:prepare');
        }
      }

      class Interceptor2 extends BaseInterceptor {
        register() {
          this._manager.add('request:prepare', (val) => val * 2, 10, 'i2:prepare');
        }
      }

      manager.attach(Interceptor1);
      manager.attach(Interceptor2);
      manager.add('request:prepare', (val) => val + 5, 8, 'on-the-fly');

      const result = await manager.run('request:prepare', 5);

      // Execution order by priority: i1:prepare (5), on-the-fly (8), i2:prepare (10)
      // (5 + 1) + 5 = 11, then 11 * 2 = 22
      expect(result).toBe(22);
    });

    it('allows re-attaching after detaching', () => {
      manager.attach(MockInterceptor1);
      manager.detach('MockInterceptor1');
      manager.attach(MockInterceptor1);

      expect(manager.providers.has('MockInterceptor1')).toBe(true);
      expect(manager.hooks.get('test:hook')).toHaveLength(1);
    });

    it('maintains hook isolation across different hookNames', async () => {
      manager.add('hook1', () => 'a', 10, 'action1');
      manager.add('hook2', () => 'b', 10, 'action2');

      const result1 = await manager.run('hook1');
      const result2 = await manager.run('hook2');

      expect(result1).toBe('a');
      expect(result2).toBe('b');
    });
  });
});
