// src/agent/internals/OfflineManager.test.js
import { OfflineManager } from './OfflineManager';
import { jest } from '@jest/globals'; // Import jest for mocking timers if needed

// Mock the uuid library
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

describe('OfflineManager', () => {
  let mockAdapter;
  let mockNetInfo;
  let mockReplayRequestFn;
  let offlineManager;
  let networkCallback; // To simulate network changes
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    mockAdapter = {
      getQueue: jest.fn().mockResolvedValue([]),
      queueRequest: jest.fn().mockResolvedValue(undefined),
      dequeueRequests: jest.fn().mockResolvedValue(undefined),
    };
    // Mock NetInfo addEventListener structure
    mockNetInfo = {
      addEventListener: jest.fn((callback) => {
        networkCallback = callback; // Capture the callback
        return jest.fn(); // Return an unsubscribe function
      }),
    };
    mockReplayRequestFn = jest.fn().mockResolvedValue(undefined);

    offlineManager = new OfflineManager(
      mockAdapter,
      mockNetInfo,
      mockReplayRequestFn
    );
    // Simulate initial online state
    networkCallback({ isConnected: true });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods after each test
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should initialize as online', () => {
    expect(offlineManager.isOnline).toBe(true);
  });

  it('should subscribe to network changes on initialization', () => {
    expect(mockNetInfo.addEventListener).toHaveBeenCalled();
  });

  describe('shouldQueue', () => {
    it('should return true for write methods when offline', () => {
      networkCallback({ isConnected: false }); // Go offline
      expect(offlineManager.shouldQueue('POST')).toBe(true);
      expect(offlineManager.shouldQueue('PUT')).toBe(true);
      expect(offlineManager.shouldQueue('PATCH')).toBe(true);
      expect(offlineManager.shouldQueue('DELETE')).toBe(true);
    });

    it('should return false for GET method even when offline', () => {
      networkCallback({ isConnected: false });
      expect(offlineManager.shouldQueue('GET')).toBe(false);
    });

    it('should return false for any method when online', () => {
      networkCallback({ isConnected: true });
      expect(offlineManager.shouldQueue('POST')).toBe(false);
      expect(offlineManager.shouldQueue('GET')).toBe(false);
    });
  });

  describe('queueRequest', () => {
    it('should call adapter.queueRequest with serialized data', async () => {
      const config = {
        method: 'POST',
        url: '/data',
        body: { a: 1 },
        headers: { h: '1' },
      };
      await offlineManager.queueRequest(config);
      expect(mockAdapter.queueRequest).toHaveBeenCalledWith({
        id: 'mock-uuid',
        method: 'POST',
        url: '/data',
        body: { a: 1 },
        headers: { h: '1' },
        timestamp: expect.any(Number),
      });
    });
  });

  describe('replayQueuedRequests', () => {
    const mockQueuedRequest = {
      id: 'uuid-1',
      method: 'POST',
      url: '/test',
      body: {},
    };

    it('should not replay if offline', async () => {
      networkCallback({ isConnected: false });
      await offlineManager.replayQueuedRequests();
      expect(mockAdapter.getQueue).not.toHaveBeenCalled();
    });

    it('should not replay if already replaying', async () => {
      offlineManager.isReplaying = true;
      await offlineManager.replayQueuedRequests();
      expect(mockAdapter.getQueue).not.toHaveBeenCalled();
    });

    it('should fetch queue, call replayRequestFn, and dequeue on success', async () => {
      mockAdapter.getQueue.mockResolvedValue([mockQueuedRequest]);
      await offlineManager.replayQueuedRequests();

      expect(mockAdapter.getQueue).toHaveBeenCalledTimes(1);
      expect(mockReplayRequestFn).toHaveBeenCalledWith(mockQueuedRequest);
      expect(mockAdapter.dequeueRequests).toHaveBeenCalledWith(['uuid-1']);
      expect(offlineManager.isReplaying).toBe(false); // Should reset flag
    });

    it('should stop replaying and not dequeue on first replay error', async () => {
      const mockRequest2 = {
        id: 'uuid-2',
        method: 'PUT',
        url: '/test2',
        body: {},
      };
      mockAdapter.getQueue.mockResolvedValue([mockQueuedRequest, mockRequest2]);
      const replayError = new Error('Replay failed');
      mockReplayRequestFn.mockRejectedValueOnce(replayError); // Fail the first replay

      await offlineManager.replayQueuedRequests();

      expect(mockAdapter.getQueue).toHaveBeenCalledTimes(1);
      expect(mockReplayRequestFn).toHaveBeenCalledTimes(1); // Only called once
      expect(mockReplayRequestFn).toHaveBeenCalledWith(mockQueuedRequest);
      expect(mockAdapter.dequeueRequests).not.toHaveBeenCalled(); // Nothing dequeued
      expect(offlineManager.isReplaying).toBe(false); // Should still reset flag
    });
  });

  describe('handleNetworkChange', () => {
    it('should trigger replayQueuedRequests when transitioning from offline to online', () => {
      const replaySpy = jest.spyOn(offlineManager, 'replayQueuedRequests');
      networkCallback({ isConnected: false }); // Go offline
      replaySpy.mockClear(); // Clear spy calls from potential initial check
      networkCallback({ isConnected: true }); // Go online
      expect(replaySpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger replayQueuedRequests when transitioning from online to offline', () => {
      const replaySpy = jest.spyOn(offlineManager, 'replayQueuedRequests');
      networkCallback({ isConnected: true }); // Stay online
      replaySpy.mockClear();
      networkCallback({ isConnected: false }); // Go offline
      expect(replaySpy).not.toHaveBeenCalled();
    });
  });

  it('should call unsubscribe on dispose', () => {
    const unsubscribeSpy = jest.fn();
    mockNetInfo.addEventListener.mockReturnValue(unsubscribeSpy);
    const managerWithSpy = new OfflineManager(
      mockAdapter,
      mockNetInfo,
      mockReplayRequestFn
    );
    managerWithSpy.dispose();
    expect(unsubscribeSpy).toHaveBeenCalled();
  });
});
