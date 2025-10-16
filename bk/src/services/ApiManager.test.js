/**
 * @file Comprehensive tests for ApiManager service
 * @author Alan Chen
 */

// Mock the ApiClient library FIRST, before any imports
jest.mock('../libraries/ApiClient', () => ({
  createApiClient: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    del: jest.fn(),
    upload: jest.fn(),
    all: jest.fn(),
    request: jest.fn(),
    abort: jest.fn(),
    setHeader: jest.fn(),
    unsetHeader: jest.fn(),
    clearHeaders: jest.fn(),
  }))
}));

// Import after mocking
import { createApiClient } from '../libraries/ApiClient';

// Import the createApiManager function to create fresh instances
const { createApiManager } = require('./ApiManager');

describe('ApiManager', () => {
  let mockApiClient;
  let manager;
  let singletonManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockApiClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      del: jest.fn(),
      upload: jest.fn(),
      all: jest.fn(),
      request: jest.fn(),
      abort: jest.fn(),
      setHeader: jest.fn(),
      unsetHeader: jest.fn(),
      clearHeaders: jest.fn(),
    };
    
    // Configure the mock to return our mock client
    createApiClient.mockReturnValue(mockApiClient);
    
    // Create a fresh manager instance for each test to avoid state persistence
    manager = createApiManager();
  });

  describe('register', () => {
    it('should register a new API client successfully', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      const client = manager.register('testClient', config);
      
      expect(createApiClient).toHaveBeenCalledWith(config);
      expect(client).toBe(mockApiClient);
    });

    it('should register a client as default when specified', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('defaultClient', config, true);
      
      expect(manager.getDefaultClientName()).toBe('defaultClient');
    });

    it('should throw error when registering client with existing name', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('duplicate', config);
      
      expect(() => {
        manager.register('duplicate', config);
      }).toThrow('An API client named \'duplicate\' is already registered');
    });

    it('should throw error when trying to set second default client', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('first', config, true);
      
      expect(() => {
        manager.register('second', config, true);
      }).toThrow('A default API client (\'first\') is already registered');
    });

    it('should throw error for invalid client name', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      expect(() => {
        manager.register('', config);
      }).toThrow('API client name must be a non-empty string');
      
      expect(() => {
        manager.register(null, config);
      }).toThrow('API client name must be a non-empty string');
      
      expect(() => {
        manager.register(123, config);
      }).toThrow('API client name must be a non-empty string');
    });
  });

  describe('use', () => {
    it('should return registered client by name', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('testClient', config);
      const client = manager.use('testClient');
      
      expect(client).toBe(mockApiClient);
    });

    it('should return default client when no name provided', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('defaultClient', config, true);
      const client = manager.use();
      
      expect(client).toBe(mockApiClient);
    });

    it('should throw error when using non-existent client', () => {
      expect(() => {
        manager.use('nonExistent');
      }).toThrow('No API client named \'nonExistent\' has been registered');
    });

    it('should throw error when no default client is set', () => {
      expect(() => {
        manager.use();
      }).toThrow('manager.use() was called without a name, but no default client has been registered');
    });
  });

  describe('isRegistered', () => {
    it('should return true for registered client', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('testClient', config);
      
      expect(manager.isRegistered('testClient')).toBe(true);
    });

    it('should return false for unregistered client', () => {
      expect(manager.isRegistered('nonExistent')).toBe(false);
    });
  });

  describe('getDefaultClientName', () => {
    it('should return null when no default client is set', () => {
      expect(manager.getDefaultClientName()).toBeNull();
    });

    it('should return default client name when one is set', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('defaultClient', config, true);
      
      expect(manager.getDefaultClientName()).toBe('defaultClient');
    });
  });

  describe('getRegisteredClientNames', () => {
    it('should return empty array when no clients are registered', () => {
      expect(manager.getRegisteredClientNames()).toEqual([]);
    });

    it('should return array of registered client names', () => {
      const config = { baseUrl: 'https://api.example.com' };
      
      manager.register('client1', config);
      manager.register('client2', config);
      manager.register('client3', config);
      
      const names = manager.getRegisteredClientNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('client1');
      expect(names).toContain('client2');
      expect(names).toContain('client3');
    });
  });

  describe('Proxy Methods', () => {
    beforeEach(() => {
      const config = { baseUrl: 'https://api.example.com' };
      manager.register('defaultClient', config, true);
    });

    it('should proxy get method to default client', async () => {
      mockApiClient.get.mockResolvedValue({ data: 'test' });
      
      const result = await manager.get('/users');
      
      expect(mockApiClient.get).toHaveBeenCalledWith('/users');
      expect(result).toEqual({ data: 'test' });
    });

    it('should proxy post method to default client', async () => {
      mockApiClient.post.mockResolvedValue({ id: 1 });
      
      const userData = { name: 'John' };
      const result = await manager.post('/users', userData);
      
      expect(mockApiClient.post).toHaveBeenCalledWith('/users', userData);
      expect(result).toEqual({ id: 1 });
    });

    it('should proxy put method to default client', async () => {
      mockApiClient.put.mockResolvedValue({ updated: true });
      
      const userData = { name: 'Jane' };
      const result = await manager.put('/users/1', userData);
      
      expect(mockApiClient.put).toHaveBeenCalledWith('/users/1', userData);
      expect(result).toEqual({ updated: true });
    });

    it('should proxy del method to default client', async () => {
      mockApiClient.del.mockResolvedValue({ deleted: true });
      
      const result = await manager.del('/users/1');
      
      expect(mockApiClient.del).toHaveBeenCalledWith('/users/1');
      expect(result).toEqual({ deleted: true });
    });

    it('should proxy upload method to default client', async () => {
      mockApiClient.upload.mockResolvedValue({ fileId: 'abc123' });
      
      const fileData = { file: 'mock-file' };
      const result = await manager.upload('/upload', fileData);
      
      expect(mockApiClient.upload).toHaveBeenCalledWith('/upload', fileData);
      expect(result).toEqual({ fileId: 'abc123' });
    });

    it('should proxy all method to default client', async () => {
      mockApiClient.all.mockResolvedValue([{ data: 'first' }, { data: 'second' }]);
      
      const requests = [
        { method: 'get', uri: '/first' },
        { method: 'get', uri: '/second' },
      ];
      const result = await manager.all(requests);
      
      expect(mockApiClient.all).toHaveBeenCalledWith(requests);
      expect(result).toEqual([{ data: 'first' }, { data: 'second' }]);
    });

    it('should proxy request method to default client', async () => {
      mockApiClient.request.mockResolvedValue({ success: true });
      
      const options = { body: { data: 'test' } };
      const result = await manager.request('/custom', options);
      
      expect(mockApiClient.request).toHaveBeenCalledWith('/custom', options);
      expect(result).toEqual({ success: true });
    });

    it('should proxy abort method to default client', () => {
      manager.abort();
      
      expect(mockApiClient.abort).toHaveBeenCalledTimes(1);
    });

    it('should proxy setHeader method to default client', () => {
      manager.setHeader('Authorization', 'Bearer token123');
      
      expect(mockApiClient.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer token123');
    });

    it('should proxy unsetHeader method to default client', () => {
      manager.unsetHeader('Authorization');
      
      expect(mockApiClient.unsetHeader).toHaveBeenCalledWith('Authorization');
    });

    it('should proxy clearHeaders method to default client', () => {
      manager.clearHeaders();
      
      expect(mockApiClient.clearHeaders).toHaveBeenCalledTimes(1);
    });

    it('should throw error when calling proxy methods without default client', () => {
      // Create a fresh manager with no registered clients for this test
      const emptyManager = createApiManager();
      
      expect(() => {
        emptyManager.get('/users');
      }).toThrow('manager.use() was called without a name, but no default client has been registered');
    });
  });

  describe('Multiple Clients', () => {
    it('should manage multiple clients independently', () => {
      const mainConfig = { baseUrl: 'https://api.example.com' };
      const analyticsConfig = { baseUrl: 'https://analytics.example.com' };
      
      const mainClient = manager.register('main', mainConfig, true);
      const analyticsClient = manager.register('analytics', analyticsConfig);
      
      expect(mainClient).toBe(mockApiClient);
      expect(analyticsClient).toBe(mockApiClient);
      expect(manager.isRegistered('main')).toBe(true);
      expect(manager.isRegistered('analytics')).toBe(true);
      expect(manager.getDefaultClientName()).toBe('main');
    });

    it('should retrieve correct client by name', () => {
      const config1 = { baseUrl: 'https://api1.example.com' };
      const config2 = { baseUrl: 'https://api2.example.com' };
      
      // Create separate mock clients to differentiate them
      const mockClient1 = { ...mockApiClient, id: 'client1' };
      const mockClient2 = { ...mockApiClient, id: 'client2' };
      
      createApiClient
        .mockReturnValueOnce(mockClient1)
        .mockReturnValueOnce(mockClient2);
      
      manager.register('client1', config1);
      manager.register('client2', config2);
      
      const retrievedClient1 = manager.use('client1');
      const retrievedClient2 = manager.use('client2');
      
      expect(retrievedClient1.id).toBe('client1');
      expect(retrievedClient2.id).toBe('client2');
    });
  });

  describe('Error Handling', () => {
    it('should handle createApiClient throwing an error', () => {
      createApiClient.mockImplementation(() => {
        throw new Error('Failed to create client');
      });
      
      expect(() => {
        manager.register('failingClient', { baseUrl: 'invalid' });
      }).toThrow('Failed to create client');
    });

    it('should maintain consistent state after failed registration', () => {
      const validConfig = { baseUrl: 'https://api.example.com' };
      
      // Register a successful client first
      manager.register('validClient', validConfig);
      
      // Try to register a failing client
      createApiClient.mockImplementationOnce(() => {
        throw new Error('Failed to create client');
      });
      
      expect(() => {
        manager.register('failingClient', { baseUrl: 'invalid' });
      }).toThrow('Failed to create client');
      
      // The valid client should still be available
      expect(manager.isRegistered('validClient')).toBe(true);
      expect(manager.isRegistered('failingClient')).toBe(false);
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      // Import the singleton manager when we need it
      const { manager: testSingletonManager } = require('./ApiManager');
      
      expect(testSingletonManager).toBeDefined();
      expect(typeof testSingletonManager.register).toBe('function');
      expect(typeof testSingletonManager.use).toBe('function');
      expect(typeof testSingletonManager.isRegistered).toBe('function');
    });
  });
});
