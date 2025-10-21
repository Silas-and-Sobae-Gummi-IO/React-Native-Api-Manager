// src/agent/internals/OfflineManager.js

import { v4 as uuidv4 } from 'uuid'; // Need a UUID library

/**
 * Manages queuing requests when offline and replaying them when online.
 */
export class OfflineManager {
  /**
   * @param {StorageAdapter} adapter - The user-provided storage adapter.
   * @param {object} netInfo - A network info provider (e.g., @react-native-community/netinfo).
   * @param {Function} replayRequestFn - A function (req) => Promise<void> to execute a replayed request.
   */
  constructor(adapter, netInfo, replayRequestFn) {
    if (!adapter || !netInfo || !replayRequestFn) {
      throw new Error(
        'OfflineManager requires adapter, netInfo, and replayRequestFn.'
      );
    }
    this.adapter = adapter;
    this.netInfo = netInfo;
    this.replayRequest = replayRequestFn;
    this.isOnline = true; // Assume online initially
    this.isReplaying = false; // Prevent concurrent replay attempts

    // Subscribe to network changes
    this.unsubscribeNetInfo = netInfo.addEventListener((state) => {
      this.handleNetworkChange(state.isConnected);
    });
  }

  /**
   * Handles network status changes, potentially triggering replay.
   * @param {boolean} isConnected
   * @private
   */
  handleNetworkChange(isConnected) {
    const wasOnline = this.isOnline;
    this.isOnline = isConnected;

    if (!wasOnline && this.isOnline) {
      console.log(
        '[OfflineManager] Network connection restored. Checking queue...'
      );
      this.replayQueuedRequests();
    } else if (wasOnline && !this.isOnline) {
      console.log('[OfflineManager] Network connection lost.');
    }
  }

  /**
   * Checks if a request should be queued based on method and network status.
   * @param {string} method - The HTTP method.
   * @returns {boolean} True if the request should be queued.
   */
  shouldQueue(method) {
    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    return !this.isOnline && writeMethods.includes(method.toUpperCase());
  }

  /**
   * Serializes and queues a request using the storage adapter.
   * @param {object} requestConfig - The original request config object.
   * @returns {Promise<void>}
   */
  async queueRequest(requestConfig) {
    const { method, url, body, headers } = requestConfig;
    const serializedRequest = {
      id: uuidv4(),
      method: method.toUpperCase(),
      url, // Assuming buildRequestConfig provides the full URL
      body, // Body must be serializable (e.g., JSON object, not FormData yet)
      headers,
      timestamp: Date.now(),
    };

    try {
      await this.adapter.queueRequest(serializedRequest);
      console.log(
        `[OfflineManager] Queued request ${serializedRequest.id} (${method} ${url})`
      );
    } catch (error) {
      console.error('[OfflineManager] Failed to queue request:', error);
      throw error; // Re-throw so the original request call fails
    }
  }

  /**
   * Attempts to replay all requests currently in the queue.
   * @returns {Promise<void>}
   */
  async replayQueuedRequests() {
    if (!this.isOnline || this.isReplaying) {
      return; // Only replay when online and not already replaying
    }

    this.isReplaying = true;
    console.log('[OfflineManager] Starting replay...');

    try {
      const queue = await this.adapter.getQueue();
      if (queue.length === 0) {
        console.log('[OfflineManager] Queue is empty.');
        return;
      }

      console.log(`[OfflineManager] Found ${queue.length} requests to replay.`);
      const successfullyReplayedIds = [];

      // Replay requests sequentially to maintain order
      for (const request of queue) {
        try {
          console.log(`[OfflineManager] Replaying request ${request.id}...`);
          // Use the provided replay function, passing the serialized request object
          await this.replayRequest(request);
          successfullyReplayedIds.push(request.id);
          console.log(
            `[OfflineManager] Successfully replayed request ${request.id}.`
          );
        } catch (replayError) {
          console.error(
            `[OfflineManager] Failed to replay request ${request.id}:`,
            replayError
          );
          // Decide on error handling: leave in queue? Move to failed queue?
          // For now, we stop replaying on the first error to avoid potential cascades.
          break;
        }
      }

      // Dequeue only the successfully replayed requests
      if (successfullyReplayedIds.length > 0) {
        await this.adapter.dequeueRequests(successfullyReplayedIds);
        console.log(
          `[OfflineManager] Dequeued ${successfullyReplayedIds.length} replayed requests.`
        );
      }
    } catch (error) {
      console.error('[OfflineManager] Error during replay process:', error);
    } finally {
      this.isReplaying = false;
      console.log('[OfflineManager] Replay finished.');
    }
  }

  /**
   * Cleans up the network listener.
   */
  dispose() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
    }
  }
}
