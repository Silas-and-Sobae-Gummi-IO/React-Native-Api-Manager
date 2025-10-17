// src/client/ApiClient.basic.test.js

import { ApiClient } from './ApiClient';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';
import { InterceptorManager } from './internals/InterceptorManager';
import { ApiError } from '../core/ApiError';

// Mock the ecosystem for basic tests
jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');
jest.mock('./internals/InterceptorManager');
global.fetch = jest.fn();

describe('ApiClient - Basic Functionality', () => {
  let apiClient;
  // We can define the mock function here, but we will set its implementation in beforeEach.
  const mockRun = jest.fn();

  beforeEach(() => {
    // 1. Reset everything to a clean state.
    jest.resetAllMocks();

    // 2. THE FIX: Re-define the mock's behavior *after* the reset.
    // This ensures every test gets a fresh, working mock.
    mockRun.mockImplementation((_, value) => Promise.resolve(value));
    InterceptorManager.prototype.run = mockRun;

    // 3. Set up other defaults for our tests.
    apiClient = new ApiClient({ baseURL: 'https://api.test.com' });
  });

  it('should be instantiated with a base configuration', () => {
    expect(apiClient.config.baseURL).toBe('https://api.test.com');
  });

  it('should correctly orchestrate a basic GET request', async () => {
    const mockRequestConfig = {
      url: 'https://api.test.com/users',
      method: 'GET',
      headers: {},
    };
    const mockFetchResponse = { ok: true, status: 200 };
    const mockParsedData = [{ id: 1, name: 'John' }];

    buildRequestConfig.mockReturnValue(mockRequestConfig);
    global.fetch.mockResolvedValue(mockFetchResponse);
    parseResponse.mockResolvedValue(mockParsedData);

    const result = await apiClient.get('/users');

    const { url, ...options } = mockRequestConfig;
    expect(global.fetch).toHaveBeenCalledWith(url, options);
    expect(parseResponse).toHaveBeenCalledWith(
      mockFetchResponse,
      expect.any(Object)
    );
    expect(mockRun).toHaveBeenCalledWith('onSuccess', mockParsedData);
    expect(result).toEqual(mockParsedData);
  });

  it('should correctly orchestrate a basic POST request', async () => {
    const postBody = { name: 'Jane' };
    buildRequestConfig.mockReturnValue({
      url: 'https://api.test.com/users',
      method: 'POST',
    });
    global.fetch.mockResolvedValue({ ok: true });
    parseResponse.mockResolvedValue({ id: 2, name: 'Jane' });

    await apiClient.post('/users', postBody);

    expect(buildRequestConfig).toHaveBeenCalledWith(
      expect.objectContaining({ body: postBody })
    );
  });

  it('should handle basic error orchestration', async () => {
    const mockError = new ApiError('Server Error', {}, { status: 500 });

    buildRequestConfig.mockReturnValue({
      url: 'https://api.test.com/error',
      method: 'GET',
    });
    global.fetch.mockResolvedValue({ ok: false });
    parseResponse.mockRejectedValue(mockError);

    await expect(apiClient.get('/error')).rejects.toThrow(ApiError);
    expect(mockRun).not.toHaveBeenCalledWith('onSuccess', expect.any(Object));
    expect(mockRun).toHaveBeenCalledWith('onError', mockError);
  });

  describe('Other HTTP methods', () => {
    it.each([
      ['put', { name: 'Updated' }],
      ['patch', { name: 'Patched' }],
      ['delete', undefined],
    ])('should correctly handle a %s request', async (method, body) => {
      const requestSpy = jest.spyOn(apiClient, '_request');

      // We need to provide a minimal successful mock for the call to complete
      buildRequestConfig.mockReturnValue({
        url: 'https://api.test.com/users/1',
        method: method.toUpperCase(),
      });
      global.fetch.mockResolvedValue({ ok: true });
      parseResponse.mockResolvedValue({});

      if (body) {
        await apiClient[method]('/users/1', body);
        expect(requestSpy).toHaveBeenCalledWith(
          expect.objectContaining({ method: method.toUpperCase(), body })
        );
      } else {
        await apiClient[method]('/users/1');
        expect(requestSpy).toHaveBeenCalledWith(
          expect.objectContaining({ method: method.toUpperCase() })
        );
      }
    });
  });
});
