// src/client/ApiClient.timing.test.js

describe('ApiClient - Timing, Cancellation, and Retry Features', () => {
  // We use .skip on the main describe block to ignore this entire file for now.
  describe.skip('Timing-based tests', () => {
    describe('Timeout feature', () => {
      it('should set up a timer when a timeout is configured', () => {});
      it('should clear the timer if the request completes successfully', () => {});
      it('should trigger the AbortController when the timeout is exceeded', () => {});
      it('should throw a specific ApiError when aborted BY the timer', () => {});
    });

    describe('cancelKey feature', () => {
      it('should abort a previous request with the same cancelKey', () => {});
    });

    describe('Retry feature', () => {
      it('should retry a request the specified number of times on failure', () => {});
      it('should only retry on specified error conditions', () => {});
      it('should wait for the specified delay between retries', () => {});
    });
  });
});
