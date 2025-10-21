// src/agent/internals/ConditionalRetrier.test.js

import { ConditionalRetrier } from './ConditionalRetrier';

// Helper to create a mock controller for tests
const createMockController = () => ({
  signal: { addEventListener: jest.fn(), aborted: false, reason: undefined },
  abort: jest.fn(),
});

// Helper to create controllable mock retry functions
const createMockRetry = () => {
  let resolveFn, rejectFn;
  const promise = new Promise((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  const mockFn = jest.fn().mockReturnValue(promise);
  return { mockFn, resolve: resolveFn, reject: rejectFn, promise };
};

describe('ConditionalRetrier', () => {
  let mockShouldRetry;
  let mockHandler;
  let retrier;

  beforeEach(() => {
    mockShouldRetry = jest.fn();
    mockHandler = jest.fn();
    retrier = new ConditionalRetrier(mockShouldRetry, mockHandler);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods after each test
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should run handler only once and retry paused requests on success', async () => {
    mockShouldRetry.mockReturnValue(true);
    let resolveHandler;
    mockHandler.mockImplementation(
      () =>
        new Promise((res) => {
          resolveHandler = res;
        })
    );

    const retry1 = createMockRetry();
    const retry2 = createMockRetry();
    const triggerError = { status: 503 };
    const controller1 = createMockController();
    const controller2 = createMockController();

    const promise1 = retrier.handleError(
      triggerError,
      retry1.mockFn,
      controller1
    );
    const promise2 = retrier.handleError(
      triggerError,
      retry2.mockFn,
      controller2
    );

    expect(mockHandler).toHaveBeenCalledTimes(1);

    // Complete the handler successfully
    resolveHandler(true);
    // Wait for the internal handlerPromise to settle
    await Promise.resolve(); // Yield to allow promise microtasks

    // Now resolve the retry functions
    retry1.resolve('retry1-success');
    retry2.resolve('retry2-success');

    await expect(promise1).resolves.toBe('retry1-success');
    await expect(promise2).resolves.toBe('retry2-success');
    expect(retry1.mockFn).toHaveBeenCalledTimes(1);
    expect(retry2.mockFn).toHaveBeenCalledTimes(1);
  });

  it('should reject all paused requests if handler fails', async () => {
    mockShouldRetry.mockReturnValue(true);
    const handlerError = new Error('Handler failed');
    let rejectHandler;
    mockHandler.mockImplementation(
      () =>
        new Promise((res, rej) => {
          rejectHandler = rej;
        })
    );

    const retry1 = createMockRetry();
    const retry2 = createMockRetry();
    const triggerError = { status: 503 };
    const controller1 = createMockController();
    const controller2 = createMockController();

    const promise1 = retrier.handleError(
      triggerError,
      retry1.mockFn,
      controller1
    );
    const promise2 = retrier.handleError(
      triggerError,
      retry2.mockFn,
      controller2
    );

    expect(mockHandler).toHaveBeenCalledTimes(1);

    // Fail the handler
    rejectHandler(handlerError);
    // Wait for the internal handlerPromise to settle (reject)
    await Promise.resolve().catch(() => {}); // Yield and catch rejection

    await expect(promise1).rejects.toBe(handlerError);
    await expect(promise2).rejects.toBe(handlerError);
    expect(retry1.mockFn).not.toHaveBeenCalled();
    expect(retry2.mockFn).not.toHaveBeenCalled();
  });

  it('should return null if shouldRetry returns false', () => {
    mockShouldRetry.mockReturnValue(false);
    const error = { status: 404 };
    const retry = createMockRetry();
    const controller = createMockController();
    const result = retrier.handleError(error, retry.mockFn, controller);
    expect(result).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
