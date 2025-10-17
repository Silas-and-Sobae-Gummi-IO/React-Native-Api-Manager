// src/client/ApiClient.advanced.test.js

import { ApiClient } from './ApiClient';
import { InterceptorManager } from './internals/InterceptorManager';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';

// We don't need to mock the internals for this test, just the manager
jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');
global.fetch = jest.fn();

describe('ApiClient - Advanced Features', () => {
  // Use a spy to monitor console logs
  let consoleSpy;
  let apiClient;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    apiClient = new ApiClient(); // Create a standard client for most tests
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('logLevel feature', () => {
    it('should add a logging interceptor if logLevel is "debug"', () => {
      // Spy on the real 'add' method *before* creating the client
      const addSpy = jest.spyOn(InterceptorManager.prototype, 'add');
      new ApiClient({ logLevel: 'debug' });

      expect(addSpy).toHaveBeenCalledWith(
        'internal-logger',
        expect.any(Object),
        expect.any(Number)
      );
      addSpy.mockRestore(); // Clean up the spy
    });

    it('should NOT add a logging interceptor if logLevel is not "debug"', () => {
      const addSpy = jest.spyOn(InterceptorManager.prototype, 'add');
      new ApiClient(); // Client without the flag
      expect(addSpy).not.toHaveBeenCalled();
      addSpy.mockRestore();
    });

    it('should actually print to the console when a request is made', async () => {
      // Use the real InterceptorManager implementation
      const { InterceptorManager: RealInterceptorManager } = jest.requireActual(
        './internals/InterceptorManager'
      );
      InterceptorManager.prototype.run = RealInterceptorManager.prototype.run;

      // Create a client with the debug flag
      const apiClient = new ApiClient({
        baseURL: 'https://api.test.com',
        logLevel: 'debug',
      });

      // Provide realistic mocks for the request lifecycle
      // The config passed to get() only has the relative URL
      buildRequestConfig.mockReturnValue({
        url: 'https://api.test.com/users',
        method: 'GET',
      });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: 'test' }),
      });
      parseResponse.mockResolvedValue({ user: 'test' });

      // Make the API call
      await apiClient.get('/users');

      // THE FIX: Assert that the logger printed the RELATIVE URL, which is what's in the config at that time.
      expect(consoleSpy).toHaveBeenCalledWith('[API Request] GET -> /users');
      expect(consoleSpy).toHaveBeenCalledWith('[API Success]', {
        user: 'test',
      });
    });
  });

  describe('transformResponse feature', () => {
    it('should transform the final data before returning it', async () => {
      // The "raw" data that our parser will return
      const rawData = { user: { data: { name: 'John', id: 123 } } };
      // The function to reshape the data
      const transformFn = (data) => data.user.data;
      // The final data we expect the user to receive
      const expectedData = { name: 'John', id: 123 };

      // Set up mocks for a successful request
      buildRequestConfig.mockReturnValue({ url: 'https://api.test.com/user' });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawData),
      });
      parseResponse.mockResolvedValue(rawData);

      // Make the API call with the transformResponse function
      const result = await apiClient.get('/user', {
        transformResponse: transformFn,
      });

      // Assert that the final result is the transformed data, not the raw data
      expect(result).toEqual(expectedData);
    });
  });

  describe('Shorthand methods', () => {
    it('should delegate to the correct method using .request()', async () => {
      // Spy on the real methods to ensure they are being called
      const getSpy = jest.spyOn(apiClient, 'get').mockResolvedValue('get call');
      const postSpy = jest
        .spyOn(apiClient, 'post')
        .mockResolvedValue('post call');

      // Test GET shorthand
      await apiClient.request('users/1');
      expect(getSpy).toHaveBeenCalledWith('users/1', {});

      // Test POST shorthand
      const body = { name: 'test' };
      await apiClient.request('post:users', body);
      expect(postSpy).toHaveBeenCalledWith('users', body, {});
    });

    it('should delegate to the InterceptorManager using .configureInterceptor()', () => {
      // Spy on the prototype methods of the real InterceptorManager
      const addSpy = jest.spyOn(InterceptorManager.prototype, 'add');
      const removeSpy = jest.spyOn(InterceptorManager.prototype, 'remove');

      // We need a real ApiClient instance for this test to have a real manager
      const clientWithRealManager = new ApiClient();
      const callback = () => {};

      // Test "add" shorthand
      clientWithRealManager.configureInterceptor('+logger@20', callback);
      expect(addSpy).toHaveBeenCalledWith('logger', callback, 20);

      // Test "remove" shorthand
      clientWithRealManager.configureInterceptor('-logger', callback);
      expect(removeSpy).toHaveBeenCalledWith('logger');

      // Clean up spies
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});
