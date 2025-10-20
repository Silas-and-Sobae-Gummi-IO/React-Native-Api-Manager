// src/client/ApiClient.test.js

import {ApiClient} from './ApiClient';
import {ApiError} from '../core/ApiError';
import {BaseInterceptor} from './interceptors/BaseInterceptor';

describe('ApiClient', () => {
  let mockFetch;

  beforeEach(() => {
    // Mock global fetch with a default successful response
    mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({data: 'mock response'}),
        text: () => Promise.resolve(JSON.stringify({data: 'mock response'})),
      })
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('creates a client instance with default config', () => {
      const client = new ApiClient();

      expect(client).toBeInstanceOf(ApiClient);
      expect(client.config).toEqual({});
      expect(client.interceptors).toBeDefined();
    });

    it('creates a client with provided config', () => {
      const client = new ApiClient({
        baseURL: 'https://api.example.com',
        headers: {authorization: 'Bearer token'},
      });

      expect(client.config.baseURL).toBe('https://api.example.com');
      expect(client.config.headers.authorization).toBe('Bearer token');
    });

    it('automatically attaches built-in interceptors on init', () => {
      const client = new ApiClient();

      // CoreInterceptor and LoggerInterceptor should be attached by their static names
      expect(client.interceptors.providers.has('core')).toBe(true);
      expect(client.interceptors.providers.has('logger')).toBe(true);
    });

    it('attaches custom interceptors from config', () => {
      class CustomInterceptor extends BaseInterceptor {
        static name = 'custom';
        register() {}
      }

      const client = new ApiClient({
        interceptors: [CustomInterceptor],
      });

      expect(client.interceptors.providers.has('custom')).toBe(true);
    });

    it('allows removing built-in interceptors via config', () => {
      const client = new ApiClient({
        interceptors: ['-logger'],
      });

      expect(client.interceptors.providers.has('core')).toBe(true);
      expect(client.interceptors.providers.has('logger')).toBe(false);
    });

    it('supports mixed attach/detach in interceptors config', () => {
      class Custom1 extends BaseInterceptor {
        static name = 'custom1';
        register() {}
      }
      class Custom2 extends BaseInterceptor {
        static name = 'custom2';
        register() {}
      }

      const client = new ApiClient({
        interceptors: [Custom1, '-logger', Custom2],
      });

      expect(client.interceptors.providers.has('core')).toBe(true);
      expect(client.interceptors.providers.has('logger')).toBe(false);
      expect(client.interceptors.providers.has('custom1')).toBe(true);
      expect(client.interceptors.providers.has('custom2')).toBe(true);
    });
  });

  describe('HTTP Method Helpers', () => {
    it('returns an ApiRequest instance', () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/users');

      expect(request.constructor.name).toBe('ApiRequest');
      expect(typeof request.send).toBe('function');
      expect(typeof request.abort).toBe('function');
    });

    it('makes a GET request with correct method and URL', async () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/users');

      await request.send();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/users');
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('makes a POST request with body', async () => {
      const client = new ApiClient();
      const body = {name: 'John', email: 'john@example.com'};
      const request = client.post('https://api.example.com/users', body);

      await request.send();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/users');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
      expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('makes a PUT request with body', async () => {
      const client = new ApiClient();
      const body = {name: 'Jane'};
      const request = client.put('https://api.example.com/users/1', body);

      await request.send();

      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
      expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('makes a PATCH request with body', async () => {
      const client = new ApiClient();
      const body = {status: 'active'};
      const request = client.patch('https://api.example.com/users/1', body);

      await request.send();

      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
      expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify(body));
    });

    it('makes a DELETE request', async () => {
      const client = new ApiClient();
      const request = client.delete('https://api.example.com/users/1');

      await request.send();

      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
  });

  describe('baseURL Configuration', () => {
    it('joins baseURL with relative path', async () => {
      const client = new ApiClient({baseURL: 'https://api.example.com'});
      const request = client.get('/users');

      await request.send();

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/users');
    });

    it('handles baseURL with trailing slash', async () => {
      const client = new ApiClient({baseURL: 'https://api.example.com/'});
      const request = client.get('/users');

      await request.send();

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/users');
    });

    it('handles relative path without leading slash', async () => {
      const client = new ApiClient({baseURL: 'https://api.example.com'});
      const request = client.get('users');

      await request.send();

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/users');
    });

    it('uses absolute URL as-is when no baseURL is set', async () => {
      const client = new ApiClient();
      const request = client.get('https://different.com/endpoint');

      await request.send();

      expect(mockFetch.mock.calls[0][0]).toBe('https://different.com/endpoint');
    });

    it('ignores baseURL when an absolute URL is provided', async () => {
      const client = new ApiClient({baseURL: 'https://api.example.com'});
      const request = client.get('https://override.com/endpoint');

      await request.send();

      expect(mockFetch.mock.calls[0][0]).toBe('https://override.com/endpoint');
    });
  });

  describe('Query Parameters', () => {
    it('appends query params to URL', async () => {
      const client = new ApiClient({baseURL: 'https://api.example.com'});
      const request = client.get('/users', {params: {page: 2, limit: 10}});

      await request.send();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('https://api.example.com/users?');
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=10');
    });

    it('handles array params by repeating the key', async () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/users', {
        params: {ids: [1, 2, 3]},
      });

      await request.send();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('ids=1');
      expect(calledUrl).toContain('ids=2');
      expect(calledUrl).toContain('ids=3');
    });

    it('omits null and undefined params', async () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/users', {
        params: {name: 'John', age: null, city: undefined},
      });

      await request.send();

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('name=John');
      expect(calledUrl).not.toContain('age');
      expect(calledUrl).not.toContain('city');
    });
  });

  describe('Headers', () => {
    it('sends headers from client config', async () => {
      const client = new ApiClient({
        headers: {authorization: 'Bearer token'},
      });
      const request = client.get('https://api.example.com/users');

      await request.send();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.authorization).toBe('Bearer token');
    });

    it('merges headers from request config', async () => {
      const client = new ApiClient({
        headers: {authorization: 'Bearer token'},
      });
      const request = client.get('https://api.example.com/users', {
        headers: {'x-custom': 'value'},
      });

      await request.send();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.authorization).toBe('Bearer token');
      expect(headers['x-custom']).toBe('value');
    });

    it('allows request headers to override client headers', async () => {
      const client = new ApiClient({
        headers: {authorization: 'Bearer old-token'},
      });
      const request = client.get('https://api.example.com/users', {
        headers: {authorization: 'Bearer new-token'},
      });

      await request.send();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.authorization).toBe('Bearer new-token');
    });

    it('normalizes header keys to lowercase', async () => {
      const client = new ApiClient({
        headers: {Authorization: 'Bearer token', 'Content-Type': 'application/json'},
      });
      const request = client.get('https://api.example.com/users');

      await request.send();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.authorization).toBe('Bearer token');
      expect(headers['content-type']).toBe('application/json');
    });
  });

  describe('Request Body', () => {
    it('stringifies object body as JSON and sets content-type', async () => {
      const client = new ApiClient();
      const body = {name: 'Alice', age: 30};
      const request = client.post('https://api.example.com/users', body);

      await request.send();

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBe(JSON.stringify(body));
      expect(fetchOptions.headers['content-type']).toBe('application/json');
    });

    it('does not override existing content-type header', async () => {
      const client = new ApiClient();
      const body = {name: 'Alice'};
      const request = client.post('https://api.example.com/users', body, {
        headers: {'content-type': 'application/vnd.api+json'},
      });

      await request.send();

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.headers['content-type']).toBe('application/vnd.api+json');
    });

    it('detects React Native file object and converts to FormData', async () => {
      const client = new ApiClient();
      const file = {uri: 'file:///image.jpg', name: 'image.jpg', type: 'image/jpeg'};
      const request = client.post('https://api.example.com/upload', {
        userId: 123,
        photo: file,
      });

      await request.send();

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBeInstanceOf(FormData);
      expect(fetchOptions.headers['content-type']).toBeUndefined(); // Browser sets this automatically
    });

    it('passes through FormData body as-is', async () => {
      const client = new ApiClient();
      const formData = new FormData();
      formData.append('key', 'value');

      const request = client.post('https://api.example.com/upload', formData);

      await request.send();

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.body).toBe(formData);
    });
  });

  describe('Response Handling', () => {
    it('returns parsed JSON data on successful response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({id: 1, name: 'John'})),
        json: () => Promise.resolve({id: 1, name: 'John'}),
      });

      const client = new ApiClient();
      const request = client.get('https://api.example.com/users/1');
      const response = await request.send();

      expect(response).toEqual({id: 1, name: 'John'});
    });

    it('returns null for 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Map(),
        text: () => Promise.resolve(''),
      });

      const client = new ApiClient();
      const request = client.delete('https://api.example.com/users/1');
      const response = await request.send();

      expect(response).toBeNull();
    });

    it('throws ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({error: 'Not Found'})),
        json: () => Promise.resolve({error: 'Not Found'}),
      });

      const client = new ApiClient();
      const request = client.get('https://api.example.com/users/999');

      await expect(request.send()).rejects.toThrow(ApiError);
    });

    it('includes response status and data in thrown ApiError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({errors: {email: 'is invalid'}})),
        json: () => Promise.resolve({errors: {email: 'is invalid'}}),
      });

      const client = new ApiClient();
      const request = client.post('https://api.example.com/users', {email: 'bad'});

      try {
        await request.send();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(422);
        expect(error.response.data).toEqual({errors: {email: 'is invalid'}});
      }
    });

    it('throws ApiError on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new ApiClient();
      const request = client.get('https://api.example.com/users');

      await expect(request.send()).rejects.toThrow();
    });
  });

  describe('Response Parsing via CoreInterceptor', () => {
    it('parses JSON response body through formatResponse hook', async () => {
      // This validates that CoreInterceptor wires up parseResponse correctly
      // The actual parsing logic is tested in CoreInterceptor.test.js
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({userId: 42, status: 'active'})),
        json: () => Promise.resolve({userId: 42, status: 'active'}),
      });

      const client = new ApiClient();
      const request = client.get('https://api.example.com/users/42');
      const data = await request.send();

      expect(data).toEqual({userId: 42, status: 'active'});
    });
  });

  describe('Request Abortion', () => {
    it('allows manual request cancellation via abort()', async () => {
      mockFetch.mockImplementationOnce(
        (url, options) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve({ok: true, status: 200, text: () => Promise.resolve('')}), 100);
            if (options.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          })
      );

      const client = new ApiClient();
      const request = client.get('https://api.example.com/slow');

      const promise = request.send();
      // Wait a tick to ensure fetch has been called and signal listener is attached
      await new Promise(resolve => setImmediate(resolve));
      request.abort();

      await expect(promise).rejects.toThrow();
    });

    it('passes abort signal to fetch', async () => {
      const client = new ApiClient();
      const request = client.get('https://api.example.com/users');

      await request.send();

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.signal).toBeDefined();
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
    });
  });


  describe('Config Merging and Overrides', () => {
    it('merges client config with request config', async () => {
      const client = new ApiClient({
        baseURL: 'https://api.example.com',
        headers: {authorization: 'Bearer token'},
      });
      const request = client.get('/users', {
        headers: {'x-request-id': '123'},
        params: {page: 1},
      });

      await request.send();

      const calledUrl = mockFetch.mock.calls[0][0];
      const headers = mockFetch.mock.calls[0][1].headers;

      expect(calledUrl).toContain('https://api.example.com/users?page=1');
      expect(headers.authorization).toBe('Bearer token');
      expect(headers['x-request-id']).toBe('123');
    });

    it('allows send() overrides to merge with and override initial body', async () => {
      const client = new ApiClient();
      const request = client.post('https://api.example.com/users', {name: 'Initial', email: 'test@example.com'});

      await request.send({name: 'Override'});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.name).toBe('Override');
      expect(body.email).toBe('test@example.com'); // Original property should still exist
    });
  });
});
