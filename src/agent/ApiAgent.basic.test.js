// src/agent/ApiAgent.basic.test.js

import agent, { ApiAgent } from './ApiAgent';
import { ApiClient } from '../client/ApiClient';

// THE FIX: Use a custom mock factory to create a more realistic mock ApiClient.
jest.mock('../client/ApiClient', () => {
  return {
    ApiClient: jest.fn().mockImplementation(() => {
      return {
        _executeAttempt: jest.fn(), // The crucial missing method
        configureInterceptor: jest.fn(),
        interceptors: {
          add: jest.fn(),
          remove: jest.fn(),
        },
      };
    }),
  };
});

describe('ApiAgent - Basic Functionality', () => {
  let testAgent;

  beforeEach(() => {
    jest.clearAllMocks(); // Use clearAllMocks instead of resetAllMocks
    testAgent = new ApiAgent();
  });

  describe('Instantiation and Singleton Pattern', () => {
    it('should export a default instance that is a valid ApiAgent', () => {
      expect(agent).toBeInstanceOf(ApiAgent);
    });
    it('should allow creating new, separate instances', () => {
      expect(testAgent).toBeInstanceOf(ApiAgent);
      expect(testAgent).not.toBe(agent);
    });
  });

  describe('Client Factory and Configuration', () => {
    it('should create and store a new ApiClient instance', () => {
      const client = testAgent.createClient('default', { baseURL: '/api' });
      expect(ApiClient).toHaveBeenCalledWith({ baseURL: '/api' });
      expect(testAgent.getClient('default')).toBe(client);
    });

    it('should throw an error when getting a non-existent client', () => {
      expect(() => testAgent.getClient('nonexistent')).toThrow(
        "ApiAgent: No client registered with the name 'nonexistent'"
      );
    });

    it('should merge global config with client-specific config', () => {
      testAgent.setGlobalConfig({ timeout: 15000 });
      testAgent.createClient('default', { baseURL: '/api' });
      expect(ApiClient).toHaveBeenCalledWith({
        timeout: 15000,
        baseURL: '/api',
      });
    });

    it('should update a client configuration by re-creating it', () => {
      testAgent.createClient('default', { baseURL: '/api' });
      testAgent.updateClientConfig('default', {
        headers: { 'X-New': 'header' },
      });
      expect(ApiClient).toHaveBeenCalledTimes(2);
      expect(ApiClient).toHaveBeenLastCalledWith({
        baseURL: '/api',
        headers: { 'X-New': 'header' },
      });
    });
  });

  describe('Global and Scoped Interceptors', () => {
    it('should call .interceptors.add() on relevant clients', () => {
      const clientA = testAgent.createClient('serviceA');
      const clientB = testAgent.createClient('serviceB');
      const callbacks = { onRequest: () => {} };
      testAgent.addGlobalInterceptor('auth', callbacks, {
        clients: ['serviceA'],
      });
      expect(clientA.interceptors.add).toHaveBeenCalledWith(
        'auth',
        callbacks,
        10
      );
      expect(clientB.interceptors.add).not.toHaveBeenCalled();
    });

    it('should call .interceptors.remove() on relevant clients', () => {
      const clientA = testAgent.createClient('serviceA');
      const clientB = testAgent.createClient('serviceB');
      const callbacks = { onRequest: () => {} };
      testAgent.addGlobalInterceptor('auth', callbacks, {
        clients: ['serviceA'],
      });
      testAgent.removeGlobalInterceptor('auth');
      expect(clientA.interceptors.remove).toHaveBeenCalledWith('auth');
      expect(clientB.interceptors.remove).not.toHaveBeenCalled();
    });
  });
});
