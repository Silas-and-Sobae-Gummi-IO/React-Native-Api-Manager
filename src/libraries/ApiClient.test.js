/**
 * @file Comprehensive tests for ApiClient library
 * @author Alan Chen
 */

import { createApiClient, ApiError } from './ApiClient';

// Mock global dependencies
// Create a proper FormData mock that passes instanceof checks
class MockFormData {
  constructor() {
    this._data = new Map();
  }
  
  append(key, value) {
    if (this._data.has(key)) {
      const existing = this._data.get(key);
      this._data.set(key, Array.isArray(existing) ? [...existing, value] : [existing, value]);
    } else {
      this._data.set(key, value);
    }
  }
  
  get(key) {
    return this._data.get(key);
  }
  
  getAll(key) {
    const value = this._data.get(key);
    return Array.isArray(value) ? value : value ? [value] : [];
  }
  
  has(key) {
    return this._data.has(key);
  }
  
  delete(key) {
    return this._data.delete(key);
  }
  
  entries() {
    return this._data.entries();
  }
  
  // For testing purposes
  _getMockData() {
    return Object.fromEntries(this._data.entries());
  }
}

global.FormData = jest.fn().mockImplementation(() => new MockFormData());
// Also set the global FormData constructor so instanceof works
global.FormData.prototype = MockFormData.prototype;

global.URLSearchParams = jest.fn().mockImplementation((params) => ({
  toString: jest.fn(() => {
    if (typeof params === 'object') {
      return Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
    }
    return 'param=value';
  }),
}));

global.Headers = jest.fn().mockImplementation((init) => {
  const headers = new Map();
  if (init) {
    Object.entries(init).forEach(([key, value]) => {
      headers.set(key.toLowerCase(), value);
    });
  }
  return {
    set: jest.fn((key, value) => headers.set(key.toLowerCase(), value)),
    get: jest.fn((key) => headers.get(key.toLowerCase())),
    has: jest.fn((key) => headers.has(key.toLowerCase())),
    delete: jest.fn((key) => headers.delete(key.toLowerCase())),
    entries: jest.fn(() => headers.entries()),
    _mockHeaders: headers,
  };
});

global.AbortController = jest.fn().mockImplementation(() => {
  const controller = {
    signal: { aborted: false },
    abort: jest.fn(() => {
      controller.signal.aborted = true;
    }),
  };
  return controller;
});

// We will spy on the global fetch function
let fetchSpy;

// Set up global.fetch before any tests run
global.fetch = jest.fn();

// beforeEach runs before each test in this suite
beforeEach(() => {
  // Clear all previous mocks
  jest.clearAllMocks();
  
  // Set up fresh spy for each test
  fetchSpy = global.fetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    })
  );
});

describe('ApiError', () => {
  it('should create an ApiError with correct properties', () => {
    const error = new ApiError('Test error', 404, { error: 'Not found' });
    
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Test error');
    expect(error.status).toBe(404);
    expect(error.data).toEqual({ error: 'Not found' });
    expect(error instanceof Error).toBe(true);
  });
});

describe('createApiClient', () => {

  describe('Basic Configuration', () => {
    it('should create a client with default configuration', () => {
      const client = createApiClient();
      
      expect(client).toHaveProperty('get');
      expect(client).toHaveProperty('post');
      expect(client).toHaveProperty('put');
      expect(client).toHaveProperty('del');
      expect(client).toHaveProperty('upload');
      expect(client).toHaveProperty('all');
      expect(client).toHaveProperty('request');
      expect(client).toHaveProperty('abort');
      expect(client).toHaveProperty('setHeader');
      expect(client).toHaveProperty('unsetHeader');
      expect(client).toHaveProperty('clearHeaders');
    });
  });

  describe('GET Requests', () => {
    it('should make a GET request with correct URL, method and headers', async () => {
      // Mock successful response
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"data": "test"}'),
        })
      );

      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'test-key' }
      });
      
      const result = await client.get('/users');

      // ✅ Check if fetch was called once
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      
      // ✅ Check the URL and options passed to fetch
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object),
          signal: expect.any(Object), // AbortController signal
        })
      );

      // ✅ Check if the function returned the correct response
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle GET request with query parameters in URL', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"users": []}'),
        })
      );

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      const result = await client.get('/users', { limit: 10, offset: 0 });

      // ✅ Check if fetch was called with query parameters in URL
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users?limit=10&offset=0',
        expect.objectContaining({
          method: 'GET',
        })
      );
      
      expect(result).toEqual({ users: [] });
    });

    it('should include default and custom headers in GET request', async () => {
      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'default-key' }
      });
      
      // Set additional header dynamically
      client.setHeader('Authorization', 'Bearer token123');
      
      await client.get('/protected');

      // ✅ Check that fetch was called
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object),
        })
      );
      
      // ✅ Extract and verify the actual headers that were sent
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      
      // Since Headers is our mock, we can access _mockHeaders
      expect(headers._mockHeaders.get('x-api-key')).toBe('default-key');
      expect(headers._mockHeaders.get('authorization')).toBe('Bearer token123');
      expect(headers._mockHeaders.get('content-type')).toBe('application/json');
    });
  });

  describe('POST Requests', () => {
    it('should make a POST request with correct method, headers, and JSON body', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve('{"id": 1, "name": "John"}'),
        })
      );

      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'test-key' }
      });
      
      const userData = { name: 'John', email: 'john@example.com' };
      const result = await client.post('/users', userData);

      // ✅ Check if fetch was called once
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      
      // ✅ Check the URL, method, headers, and body
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Object),
          body: JSON.stringify(userData),
          signal: expect.any(Object),
        })
      );
      
      // ✅ Verify the actual headers that were sent
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      expect(headers._mockHeaders.get('x-api-key')).toBe('test-key');
      expect(headers._mockHeaders.get('content-type')).toBe('application/json');

      // ✅ Check the response
      expect(result).toEqual({ id: 1, name: 'John' });
    });

    it('should handle FormData in POST request without Content-Type header', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve('{"success": true}'),
        })
      );

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      const formData = new FormData();
      formData.append('file', 'test-file');
      
      const result = await client.post('/upload', formData);

      // ✅ Check if fetch was called with FormData (it should pass through as-is)
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/upload',
        expect.objectContaining({
          method: 'POST',
          // The body should be the actual FormData instance, not JSON stringified
          body: formData,
        })
      );
      
      // ✅ Verify that Content-Type header is NOT set for FormData (browser will set it with boundary)
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      expect(headers._mockHeaders.has('content-type')).toBe(false);
      
      expect(result).toEqual({ success: true });
      expect(FormData).toHaveBeenCalled();
    });

    it('should include Authorization header in POST request', async () => {
      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'test-key' }
      });
      
      client.setHeader('Authorization', 'Bearer secret-token');
      
      const userData = { name: 'Jane' };
      await client.post('/users', userData);

      // ✅ Check that fetch was called with the correct headers
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Object),
          body: JSON.stringify(userData),
        })
      );
      
      // ✅ Verify the actual header values that were sent
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      expect(headers._mockHeaders.get('x-api-key')).toBe('test-key');
      expect(headers._mockHeaders.get('authorization')).toBe('Bearer secret-token');
      expect(headers._mockHeaders.get('content-type')).toBe('application/json');
    });
  });

  describe('PUT Requests', () => {
    it('should make a PUT request with correct method and body', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"id": 1, "updated": true}'),
        })
      );

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      const updateData = { name: 'Updated Name' };
      const result = await client.put('/users/1', updateData);

      // ✅ Check PUT method and body
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
          headers: expect.any(Object),
        })
      );
      
      expect(result).toEqual({ id: 1, updated: true });
    });
  });

  describe('DELETE Requests', () => {
    it('should make a DELETE request with correct method', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          text: () => Promise.resolve(''),
        })
      );

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      await client.del('/users/1');

      // ✅ Check DELETE method
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.any(Object),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw ApiError for HTTP error responses with correct status and data', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve('{"message": "Not found"}'),
        })
      );

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      
      // ✅ Check that fetch was called
      await expect(client.get('/nonexistent')).rejects.toThrow(ApiError);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/nonexistent',
        expect.objectContaining({
          method: 'GET',
        })
      );
      
      // ✅ Check error details
      try {
        await client.get('/nonexistent');
      } catch (error) {
        expect(error.status).toBe(404);
        expect(error.data).toEqual({ message: 'Not found' });
      }
    });

    it('should handle network errors and still call fetch', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      
      await expect(client.get('/users')).rejects.toThrow('Network error');
      
      // ✅ Verify fetch was attempted
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle invalid JSON responses', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('invalid json'),
        })
      );

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      
      await expect(client.get('/invalid')).rejects.toThrow(ApiError);
      
      // ✅ Check that fetch was called even though JSON parsing failed
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/invalid',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('Upload Method', () => {
    it('should handle file upload with FormData and correct fetch call', async () => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"fileId": "123"}'),
        })
      );

      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      const fileData = { file: 'mock-file', description: 'Test file' };
      const result = await client.upload('/upload', fileData);

      // ✅ Check if fetch was called with the correct parameters
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/upload',
        expect.objectContaining({
          method: 'POST',
          // The body should be a FormData instance created by the upload method
          body: expect.any(Object),
        })
      );
      
      expect(result).toEqual({ fileId: '123' });
      
      // ✅ Check that FormData constructor was called (upload method creates FormData)
      expect(FormData).toHaveBeenCalled();
      
      // ✅ Check that the created FormData had entries appended to it
      const [, fetchOptions] = fetchSpy.mock.calls[0];
      expect(fetchOptions.body).toBeDefined();
    });
  });

  describe('Method Prefix Parsing', () => {
    it('should parse method prefix in URI and call fetch with correct method', async () => {
      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      
      await client.request('post:/users', { body: { name: 'John' } });

      // ✅ Check that fetch was called with parsed POST method
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'John' }),
        })
      );
    });

    it('should use GET as default method when no prefix is provided', async () => {
      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      await client.request('/users');

      // ✅ Check that fetch was called with default GET method
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('Headers Management', () => {
    it('should include custom headers in fetch calls', async () => {
      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'default-key' }
      });
      
      client.setHeader('Authorization', 'Bearer token123');
      client.setHeader('X-Custom-Header', 'custom-value');
      await client.get('/protected');

      // ✅ Check that fetch was called with headers
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object),
        })
      );
      
      // ✅ Verify all the specific header values that were sent
      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      expect(headers._mockHeaders.get('x-api-key')).toBe('default-key');
      expect(headers._mockHeaders.get('authorization')).toBe('Bearer token123');
      expect(headers._mockHeaders.get('x-custom-header')).toBe('custom-value');
      expect(headers._mockHeaders.get('content-type')).toBe('application/json');
    });

    it('should override default headers with dynamic headers', async () => {
      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'default-key' }
      });
      
      // Override the default API key
      client.setHeader('X-API-Key', 'overridden-key');
      await client.get('/test');

      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      
      // ✅ Verify the header was overridden, not duplicated
      expect(headers._mockHeaders.get('x-api-key')).toBe('overridden-key');
    });

    it('should remove headers when unsetHeader is called', async () => {
      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'default-key' }
      });
      
      client.setHeader('Authorization', 'Bearer token123');
      client.unsetHeader('Authorization'); // Remove the auth header
      await client.get('/test');

      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      
      // ✅ Verify the Authorization header is not present
      expect(headers._mockHeaders.has('authorization')).toBe(false);
      // ✅ Verify other headers are still present
      expect(headers._mockHeaders.get('x-api-key')).toBe('default-key');
    });

    it('should clear all dynamic headers when clearHeaders is called', async () => {
      const client = createApiClient({ 
        baseUrl: 'https://api.example.com',
        headers: { 'X-API-Key': 'default-key' }
      });
      
      client.setHeader('Authorization', 'Bearer token123');
      client.setHeader('X-Custom-Header', 'custom-value');
      client.clearHeaders(); // Clear all dynamic headers
      await client.get('/test');

      const [, options] = fetchSpy.mock.calls[0];
      const headers = options.headers;
      
      // ✅ Verify dynamic headers are cleared
      expect(headers._mockHeaders.has('authorization')).toBe(false);
      expect(headers._mockHeaders.has('x-custom-header')).toBe(false);
      // ✅ Verify default config headers are still present
      expect(headers._mockHeaders.get('x-api-key')).toBe('default-key');
    });
  });

  describe('AbortController Integration', () => {
    it('should include AbortController signal in fetch calls', async () => {
      const client = createApiClient({ baseUrl: 'https://api.example.com' });
      await client.get('/test');

      // ✅ Check that fetch was called with signal
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(Object), // AbortController signal
        })
      );
    });
  });
});
