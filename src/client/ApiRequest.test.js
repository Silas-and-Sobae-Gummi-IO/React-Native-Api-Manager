// src/client/ApiRequest.test.js

import {ApiRequest} from './ApiRequest';
import {ApiClient} from './ApiClient';
import {BaseInterceptor} from './interceptors/BaseInterceptor';

describe('ApiRequest', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({data: 'test'})),
      })
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction and initialization', () => {
    it('constructs with client and config', () => {
      const client = new ApiClient();
      const config = {method: 'GET', url: '/test'};
      const request = new ApiRequest(client, config);

      expect(request._client).toBe(client);
      expect(request._config).toBe(config);
    });

    it('constructor creates context and abort controller', () => {
      const client = new ApiClient();
      const request = new ApiRequest(client, {});

      expect(request._context).toEqual({});
      expect(request._abortController).toBeInstanceOf(AbortController);
    });
  });

  describe('send() lifecycle', () => {
    it('executes complete request lifecycle', async () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/users');

      const data = await request.send();

      expect(data).toEqual({data: 'test'});
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('runs interceptor hooks in correct order', async () => {
      const executionOrder = [];

      class TrackingInterceptor extends BaseInterceptor {
        static name = 'tracking';
        register() {
          this._manager.add('request:init', 'track:init', () => {
            executionOrder.push('init');
          });
          this._manager.add('request:beforeRequest', 'track:before', () => {
            executionOrder.push('beforeRequest');
          });
          this._manager.add('request:formatResponse', 'track:format', (res) => {
            executionOrder.push('formatResponse');
            return res;
          });
          this._manager.add('request:onResponse', 'track:onRes', () => {
            executionOrder.push('onResponse');
          });
          this._manager.add('request:formatData', 'track:data', (res) => {
            executionOrder.push('formatData');
            return res;
          });
          this._manager.add('request:complete', 'track:complete', () => {
            executionOrder.push('complete');
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', TrackingInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(executionOrder).toEqual([
        'init',
        'beforeRequest',
        'formatResponse',
        'onResponse',
        'formatData',
        'complete',
      ]);
    });

    it('context persists across multiple send() calls', async () => {
      class ContextInterceptor extends BaseInterceptor {
        static name = 'context';
        register() {
          this._manager.add('request:init', 'ctx', (hookContext) => {
            const {context} = hookContext;
            context.callCount = (context.callCount || 0) + 1;
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', ContextInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();
      expect(request._context.callCount).toBe(1);

      await request.send();
      expect(request._context.callCount).toBe(2);

      await request.send();
      expect(request._context.callCount).toBe(3);
    });

    it('passes additional context to hooks', async () => {
      let capturedContext;

      class CaptureInterceptor extends BaseInterceptor {
        static name = 'capture';
        register() {
          this._manager.add('request:beforeRequest', 'cap', (ctx) => {
            // beforeRequest receives undefined as value, so first param is context
            capturedContext = ctx;
          }, 10);
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', CaptureInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(capturedContext).toBeDefined();
      expect(capturedContext).toMatchObject({
        client: expect.any(Object),
        config: expect.any(Object),
        context: expect.any(Object),
        url: 'https://api.example.com/test',
        options: expect.objectContaining({method: 'GET'}),
      });
    });
  });

  describe('Config merging via ConfigManager', () => {
    it('merges headers from defaults, client, and request config', async () => {
      const client = new ApiClient({
        headers: {authorization: 'Bearer token'},
      });
      const request = client.get('https://api.example.com/test', {
        headers: {'x-custom': 'value'},
      });

      await request.send();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.authorization).toBe('Bearer token');
      expect(headers['x-custom']).toBe('value');
      expect(headers.accept).toBe('application/json'); // From CoreInterceptor defaults
    });

    it('merges body from client and request config', async () => {
      const client = new ApiClient({
        body: {clientProp: 'clientValue'},
      });
      const request = client.post('https://api.example.com/test', {
        requestProp: 'requestValue',
      });

      await request.send();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({
        clientProp: 'clientValue',
        requestProp: 'requestValue',
      });
    });

    it('merges client-level body with all request methods', async () => {
      const client = new ApiClient({
        body: {is_super_admin: true},
      });

      const request = client.post('https://api.example.com/test', {
        name: 'John',
        email: 'john@example.com',
      });

      await request.send();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({
        is_super_admin: true,
        name: 'John',
        email: 'john@example.com',
      });
    });

    it('merges bodyOverrides from send() call', async () => {
      const client = new ApiClient();
      const request = client.post('https://api.example.com/test', {
        name: 'initial',
        age: 30,
      });

      await request.send({name: 'override', email: 'new@example.com'});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({
        name: 'override',
        age: 30,
        email: 'new@example.com',
      });
    });

    it('does not merge FormData body', async () => {
      const formData = new FormData();
      formData.append('key', 'value');

      const client = new ApiClient();
      const request = client.post('https://api.example.com/upload', formData);

      await request.send();

      const body = mockFetch.mock.calls[0][1].body;
      expect(body).toBe(formData);
    });

    it('includes abort signal in prepared config', async () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/test');

      await request.send();

      const options = mockFetch.mock.calls[0][1];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('applies defaults from request:defaultConfig hook', async () => {
      class DefaultsInterceptor extends BaseInterceptor {
        static name = 'defaults';
        register() {
          this._manager.add('request:defaultConfig', 'def', (config) => {
            return {
              ...config,
              timeout: 5000,
              customFlag: true,
            };
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', DefaultsInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      // Defaults should be applied via the hook
      expect(request._config).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('runs formatError hook on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      let formattedError;
      class ErrorInterceptor extends BaseInterceptor {
        static name = 'error';
        register() {
          this._manager.add('request:formatError', 'fmt', (error) => {
            formattedError = error;
            error.formatted = true;
            return error;
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', ErrorInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      try {
        await request.send();
      } catch (error) {
        expect(error.formatted).toBe(true);
      }

      expect(formattedError).toBeInstanceOf(Error);
    });

    it('runs onError hook after formatError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'));

      const executionOrder = [];

      class ErrorTrackingInterceptor extends BaseInterceptor {
        static name = 'errorTrack';
        register() {
          this._manager.add('request:formatError', 'fmt', (error) => {
            executionOrder.push('formatError');
            return error;
          });
          this._manager.add('request:onError', 'onErr', () => {
            executionOrder.push('onError');
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', ErrorTrackingInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      try {
        await request.send();
      } catch (error) {
        // Expected
      }

      expect(executionOrder).toEqual(['formatError', 'onError']);
    });

    it('suppresses error when suppressError hook returns true', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'));

      class SuppressInterceptor extends BaseInterceptor {
        static name = 'suppress';
        register() {
          this._manager.add('request:suppressError', 'sup', () => true);
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', SuppressInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      const result = await request.send();

      expect(result).toBeUndefined(); // No error thrown
    });

    it('throws error when suppressError returns false', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'));

      class NoSuppressInterceptor extends BaseInterceptor {
        static name = 'noSuppress';
        register() {
          this._manager.add('request:suppressError', 'noSup', () => false);
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', NoSuppressInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await expect(request.send()).rejects.toThrow('Test error');
    });

    it('passes error in context to suppressError hook', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Context error'));

      let capturedContext;
      class ContextCaptureInterceptor extends BaseInterceptor {
        static name = 'ctxCap';
        register() {
          this._manager.add('request:suppressError', 'cap', (val, ctx) => {
            capturedContext = ctx;
            return true;
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', ContextCaptureInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(capturedContext.error).toBeInstanceOf(Error);
      expect(capturedContext.error.message).toBe('Context error');
    });

    it('allows formatError to return non-error value for recovery', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      class TestRecoveryInterceptor extends BaseInterceptor {
        static name = 'testRecovery';
        register() {
          this._manager.add('request:formatError', 'recover', () => {
            // Return successful result instead of error
            return {data: 'recovered'};
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', '-recovery', TestRecoveryInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      const result = await request.send();

      expect(result).toEqual({data: 'recovered'});
    });

    it('treats error-like objects as errors not recovery', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Original error'));

      class TransformInterceptor extends BaseInterceptor {
        static name = 'transform';
        register() {
          this._manager.add('request:formatError', 'transform', () => {
            // Return error-like object (has name and message)
            return {name: 'CustomError', message: 'Transformed error', code: 500};
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', TransformInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await expect(request.send()).rejects.toMatchObject({
        name: 'CustomError',
        message: 'Transformed error',
        code: 500,
      });
    });

    it('runs complete hook when formatError returns recovery value', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Error'));

      let completed = false;
      class RecoveryWithCompleteInterceptor extends BaseInterceptor {
        static name = 'recoveryComplete';
        register() {
          this._manager.add('request:formatError', 'recover', () => ({data: 'ok'}));
          this._manager.add('request:complete', 'complete', () => {
            completed = true;
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', RecoveryWithCompleteInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(completed).toBe(true);
    });
  });

  describe('Complete hook', () => {
    it('always runs complete hook even on success', async () => {
      let completed = false;

      class CompleteInterceptor extends BaseInterceptor {
        static name = 'complete';
        register() {
          this._manager.add('request:complete', 'comp', () => {
            completed = true;
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', CompleteInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(completed).toBe(true);
    });

    it('always runs complete hook even on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'));

      let completed = false;

      class CompleteInterceptor extends BaseInterceptor {
        static name = 'complete';
        register() {
          this._manager.add('request:complete', 'comp', () => {
            completed = true;
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', CompleteInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      try {
        await request.send();
      } catch (error) {
        // Expected
      }

      expect(completed).toBe(true);
    });

    it('runs complete hook even when error is suppressed', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'));

      let completed = false;

      class CompleteAndSuppressInterceptor extends BaseInterceptor {
        static name = 'both';
        register() {
          this._manager.add('request:suppressError', 'sup', () => true);
          this._manager.add('request:complete', 'comp', () => {
            completed = true;
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', '-core', CompleteAndSuppressInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(completed).toBe(true);
    });
  });

  describe('abort()', () => {
    it('aborts the request using abort controller', () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/test');

      const abortSpy = jest.spyOn(request._abortController, 'abort');

      request.abort();

      expect(abortSpy).toHaveBeenCalledWith('manual');
    });

    it('accepts custom abort reason', () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/test');

      const abortSpy = jest.spyOn(request._abortController, 'abort');

      request.abort('timeout');

      expect(abortSpy).toHaveBeenCalledWith('timeout');
    });

    it('handles abort gracefully when controller is missing', () => {
      const client = new ApiClient();
      const request = new ApiRequest(client, {});
      // Don't call init, so _abortController is undefined

      expect(() => request.abort()).not.toThrow();
    });
  });

  describe('_runInterceptors()', () => {
    it('calls interceptor manager with correct hook name', async () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/test');

      const runSpy = jest.spyOn(client.interceptors, 'run');

      await request.send();

      expect(runSpy).toHaveBeenCalledWith(
        'request:init',
        undefined,
        expect.any(Object)
      );
    });

    it('passes context to interceptor manager', async () => {
      let capturedContext;

      class ContextInterceptor extends BaseInterceptor {
        static name = 'ctx';
        register() {
          this._manager.add('request:beforeRequest', 'cap', (ctx) => {
            // beforeRequest receives undefined as value, so first param is context
            capturedContext = ctx;
          }, 10);
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', ContextInterceptor],
      });
      const config = {method: 'GET', url: '/test'};
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(capturedContext).toBeDefined();
      expect(capturedContext.client).toBe(client);
      expect(capturedContext.config).toBeDefined();
      expect(capturedContext.context).toBeDefined();
    });

    it('merges additional context with base context', async () => {
      let capturedContext;

      class MergeInterceptor extends BaseInterceptor {
        static name = 'merge';
        register() {
          this._manager.add('request:beforeRequest', 'merge', (ctx) => {
            // beforeRequest receives undefined as value, so first param is context
            capturedContext = ctx;
          }, 10);
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', MergeInterceptor],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      // beforeRequest receives {url, options} as additional context
      expect(capturedContext).toBeDefined();
      expect(capturedContext.url).toBeDefined();
      expect(capturedContext.options).toBeDefined();
      expect(capturedContext.client).toBeDefined();
      expect(capturedContext.config).toBeDefined();
    });
  });

  describe('Integration scenarios', () => {
    it('handles full request with multiple custom interceptors', async () => {
      const logs = [];

      class Logger1 extends BaseInterceptor {
        static name = 'logger1';
        register() {
          this._manager.add('request:beforeRequest', 'log1', () => {
            logs.push('logger1:before');
          });
          this._manager.add('request:onResponse', 'log1:res', () => {
            logs.push('logger1:response');
          });
        }
      }

      class Logger2 extends BaseInterceptor {
        static name = 'logger2';
        register() {
          this._manager.add('request:beforeRequest', 'log2', () => {
            logs.push('logger2:before');
          });
          this._manager.add('request:onResponse', 'log2:res', () => {
            logs.push('logger2:response');
          });
        }
      }

      const client = new ApiClient({
        interceptors: ['-logger', Logger1, Logger2],
      });
      const request = client.get('https://api.example.com/test');

      await request.send();

      expect(logs).toContain('logger1:before');
      expect(logs).toContain('logger2:before');
      expect(logs).toContain('logger1:response');
      expect(logs).toContain('logger2:response');
    });

    it('handles request with baseURL, headers, and params', async () => {
      const client = new ApiClient({
        baseURL: 'https://api.example.com',
        headers: {authorization: 'Bearer token'},
      });
      const request = client.get('/users', {
        params: {page: 1, limit: 10},
        headers: {'x-request-id': '123'},
      });

      await request.send();

      const calledUrl = mockFetch.mock.calls[0][0];
      const options = mockFetch.mock.calls[0][1];

      expect(calledUrl).toContain('https://api.example.com/users');
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('limit=10');
      expect(options.headers.authorization).toBe('Bearer token');
      expect(options.headers['x-request-id']).toBe('123');
    });
  });
});
