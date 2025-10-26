// src/client/lib/ConfigManager.test.js

import {ConfigManager} from './ConfigManager';

describe('ConfigManager', () => {
  let mockInterceptors;
  let configManager;

  beforeEach(() => {
    mockInterceptors = {
      run: jest.fn((hookName, config) => Promise.resolve(config)),
    };
    configManager = new ConfigManager(mockInterceptors);
  });

  describe('prepare', () => {
    it('merges client and request configs', async () => {
      const clientConfig = {baseURL: 'https://api.example.com', timeout: 5000};
      const requestConfig = {url: '/users', method: 'GET'};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result).toMatchObject({
        baseURL: 'https://api.example.com',
        timeout: 5000,
        url: '/users',
        method: 'GET',
        signal: abortSignal,
      });
    });

    it('request config overrides client config', async () => {
      const clientConfig = {timeout: 5000};
      const requestConfig = {timeout: 10000};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.timeout).toBe(10000);
    });

    it('runs defaultConfig hook with empty object first', async () => {
      const clientConfig = {};
      const requestConfig = {};
      const abortSignal = new AbortController().signal;

      await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(mockInterceptors.run).toHaveBeenCalledWith('request:defaultConfig', {});
    });

    it('runs prepareConfig hook with merged config', async () => {
      const clientConfig = {baseURL: 'https://api.example.com'};
      const requestConfig = {url: '/users'};
      const abortSignal = new AbortController().signal;

      await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(mockInterceptors.run).toHaveBeenCalledWith(
        'request:prepareConfig',
        expect.objectContaining({
          baseURL: 'https://api.example.com',
          url: '/users',
        })
      );
    });
  });

  describe('_mergeHeaders', () => {
    it('merges client and request headers', async () => {
      const clientConfig = {headers: {authorization: 'Bearer token'}};
      const requestConfig = {headers: {'x-custom': 'value'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.headers).toEqual({
        authorization: 'Bearer token',
        'x-custom': 'value',
      });
    });

    it('request headers override client headers', async () => {
      const clientConfig = {headers: {'content-type': 'application/json'}};
      const requestConfig = {headers: {'content-type': 'text/plain'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.headers['content-type']).toBe('text/plain');
    });

    it('handles missing headers gracefully', async () => {
      const clientConfig = {};
      const requestConfig = {};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.headers).toEqual({});
    });
  });

  describe('_mergeBody', () => {
    it('merges client and request body', async () => {
      const clientConfig = {body: {userId: 123}};
      const requestConfig = {body: {name: 'John'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.body).toEqual({userId: 123, name: 'John'});
    });

    it('request body overrides client body keys', async () => {
      const clientConfig = {body: {userId: 123, name: 'Old'}};
      const requestConfig = {body: {name: 'New'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.body).toEqual({userId: 123, name: 'New'});
    });

    it('merges send-time body overrides', async () => {
      const clientConfig = {body: {userId: 123}};
      const requestConfig = {body: {name: 'John'}};
      const bodyOverrides = {email: 'john@example.com'};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, bodyOverrides, abortSignal);

      expect(result.body).toEqual({
        userId: 123,
        name: 'John',
        email: 'john@example.com',
      });
    });

    it('send-time overrides have highest priority', async () => {
      const clientConfig = {body: {name: 'Client'}};
      const requestConfig = {body: {name: 'Request'}};
      const bodyOverrides = {name: 'Override'};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, bodyOverrides, abortSignal);

      expect(result.body.name).toBe('Override');
    });

    it('handles FormData in request body (non-mergeable)', async () => {
      const formData = new FormData();
      formData.append('file', 'test');

      const clientConfig = {body: {userId: 123}};
      const requestConfig = {body: formData};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.body).toBe(formData);
      expect(result.body).toBeInstanceOf(FormData);
    });

    it('handles FormData in send-time overrides', async () => {
      const formData = new FormData();
      formData.append('file', 'test');

      const clientConfig = {body: {userId: 123}};
      const requestConfig = {body: {name: 'John'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, formData, abortSignal);

      expect(result.body).toBe(formData);
      expect(result.body).toBeInstanceOf(FormData);
    });

    it('handles missing body gracefully', async () => {
      const clientConfig = {};
      const requestConfig = {};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.body).toBeUndefined();
    });

    it('handles empty body overrides', async () => {
      const clientConfig = {body: {userId: 123}};
      const requestConfig = {body: {name: 'John'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.body).toEqual({userId: 123, name: 'John'});
    });

    it('handles non-object body values', async () => {
      const clientConfig = {};
      const requestConfig = {body: 'raw string'};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.body).toBe('raw string');
    });

    it('handles null body overrides without throwing', async () => {
      const clientConfig = {body: {userId: 123}};
      const requestConfig = {body: {name: 'John'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, null, abortSignal);

      expect(result.body).toEqual({userId: 123, name: 'John'});
    });

    it('handles undefined body overrides without throwing', async () => {
      const clientConfig = {body: {userId: 123}};
      const requestConfig = {body: {name: 'John'}};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, undefined, abortSignal);

      expect(result.body).toEqual({userId: 123, name: 'John'});
    });
  });

  describe('Hook System', () => {
    it('calls hooks in correct order', async () => {
      const callOrder = [];
      mockInterceptors.run = jest.fn((hookName, config) => {
        callOrder.push(hookName);
        return Promise.resolve(config);
      });

      const clientConfig = {};
      const requestConfig = {};
      const abortSignal = new AbortController().signal;

      await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(callOrder).toEqual([
        'request:defaultConfig',
        'request:clientConfig',
        'request:requestConfig',
        'request:prepareConfig',
      ]);
    });

    it('merges defaultConfig output with user configs', async () => {
      // Mock defaultConfig to return some defaults
      mockInterceptors.run = jest.fn((hookName, config) => {
        if (hookName === 'request:defaultConfig') {
          return Promise.resolve({
            autoFixJson: true,
            timeout: 5000,
            headers: {accept: 'application/json'},
          });
        }
        return Promise.resolve(config);
      });

      const clientConfig = {timeout: 10000, baseURL: 'https://api.example.com'};
      const requestConfig = {url: '/users'};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      // User config should override defaults
      expect(result.timeout).toBe(10000);
      // Defaults should be present if not overridden
      expect(result.autoFixJson).toBe(true);
      // User configs should be preserved
      expect(result.baseURL).toBe('https://api.example.com');
      expect(result.url).toBe('/users');
    });

    it('allows prepareConfig to modify merged config', async () => {
      mockInterceptors.run = jest.fn((hookName, config) => {
        if (hookName === 'request:prepareConfig') {
          return Promise.resolve({
            ...config,
            modified: true,
          });
        }
        return Promise.resolve(config);
      });

      const clientConfig = {baseURL: 'https://api.example.com'};
      const requestConfig = {};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.modified).toBe(true);
      expect(result.baseURL).toBe('https://api.example.com');
    });
  });

  describe('Integration', () => {
    it('passes abort signal to merged config', async () => {
      const clientConfig = {};
      const requestConfig = {};
      const abortController = new AbortController();

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortController.signal);

      expect(result.signal).toBe(abortController.signal);
    });

    it('preserves custom config fields', async () => {
      const clientConfig = {customField: 'value1'};
      const requestConfig = {anotherField: 'value2'};
      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, {}, abortSignal);

      expect(result.customField).toBe('value1');
      expect(result.anotherField).toBe('value2');
    });

    it('handles complex merging scenario', async () => {
      const clientConfig = {
        baseURL: 'https://api.example.com',
        headers: {authorization: 'Bearer token'},
        body: {userId: 123, isAdmin: true},
        timeout: 5000,
      };

      const requestConfig = {
        url: '/users',
        method: 'POST',
        headers: {'x-request-id': 'abc123'},
        body: {name: 'John'},
        timeout: 10000,
      };

      const bodyOverrides = {
        email: 'john@example.com',
      };

      const abortSignal = new AbortController().signal;

      const result = await configManager.prepare(clientConfig, requestConfig, bodyOverrides, abortSignal);

      expect(result).toMatchObject({
        baseURL: 'https://api.example.com',
        url: '/users',
        method: 'POST',
        timeout: 10000,
        signal: abortSignal,
      });

      expect(result.headers).toEqual({
        authorization: 'Bearer token',
        'x-request-id': 'abc123',
      });

      expect(result.body).toEqual({
        userId: 123,
        isAdmin: true,
        name: 'John',
        email: 'john@example.com',
      });
    });
  });
});
