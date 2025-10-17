// src/client/ApiClient.advanced.test.js

describe('ApiClient - Advanced Features', () => {
  describe('Timeout and Abort feature', () => {
    it('should set up a timer when a timeout is configured', () => {
      // Test implementation will go here...
    });
    it('should clear the timer if the request completes successfully', () => {
      // Test implementation will go here...
    });
    it('should trigger the AbortController when the timeout is exceeded', () => {
      // Test implementation will go here...
    });
    it('should throw a specific ApiError when aborted BY the timer', () => {
      // Test implementation will go here...
    });
    it('should NOT throw a timeout error if aborted by another mechanism', () => {
      // Test implementation will go here...
    });
  });

  describe('Retry feature', () => {
    it('should NOT retry on a successful request', () => {
      // Test implementation will go here...
    });
    it('should retry a request the specified number of times on failure', () => {
      // Test implementation will go here...
    });
    it('should only retry on specified error conditions', () => {
      // Test implementation will go here...
    });
    it('should wait for the specified delay between retries', () => {
      // Test implementation will go here...
    });
  });

  describe('cancelKey feature', () => {
    it('should abort a previous request with the same cancelKey', () => {
      // Test implementation will go here...
    });
  });
});
