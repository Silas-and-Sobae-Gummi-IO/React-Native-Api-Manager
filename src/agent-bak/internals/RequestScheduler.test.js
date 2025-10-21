// src/agent/internals/RequestScheduler.test.js

import { RequestScheduler } from './RequestScheduler';

// Helper function to create a mock controller for tests
const createMockController = () => ({
  signal: { addEventListener: jest.fn(), aborted: false }, // Provide the signal object
  abort: jest.fn(),
});

describe('RequestScheduler', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new RequestScheduler();
  });

  describe('Concurrency', () => {
    it('should only run one request at a time if concurrency is 1', async () => {
      scheduler.configureChannels({ test: { concurrency: 1 } });

      const task1 = jest.fn(
        () => new Promise((r) => setTimeout(() => r('done1'), 10))
      );
      const task2 = jest.fn(() => new Promise((r) => r('done2')));

      const controller1 = createMockController();
      const controller2 = createMockController();

      const promise1 = scheduler.schedule(
        task1,
        { channel: 'test' },
        controller1
      );
      const promise2 = scheduler.schedule(
        task2,
        { channel: 'test' },
        controller2
      );

      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).not.toHaveBeenCalled();

      await promise1;

      // THE FIX: Yield to the event loop to allow the scheduler to process the queue.
      await new Promise(process.nextTick);

      // Now task2 should have been called.
      expect(task2).toHaveBeenCalledTimes(1);

      await expect(promise1).resolves.toBe('done1');
      await expect(promise2).resolves.toBe('done2');
    });
  });

  describe('Pausing and Resuming', () => {
    it('should queue requests on a paused channel and run them on resume', async () => {
      scheduler.configureChannels({ test: { concurrency: 1 } });
      const task = jest.fn(() => Promise.resolve('done'));
      const controller = createMockController();

      scheduler.pauseChannel('test');
      const promise = scheduler.schedule(task, { channel: 'test' }, controller);

      // While paused, the task should not be called
      expect(task).not.toHaveBeenCalled();

      scheduler.resumeChannel('test');

      // After resuming, the task should be called
      expect(task).toHaveBeenCalledTimes(1);
      await expect(promise).resolves.toBe('done');
    });
  });

  describe('Scoped Cancellation', () => {
    it('should abort all requests within a specific scope', () => {
      scheduler.configureChannels({ test: { concurrency: 2 } });

      const controller1 = createMockController();
      const controller2 = createMockController();
      const controller3 = createMockController();

      // Schedule three hanging promises
      scheduler.schedule(
        () => new Promise(() => {}),
        { channel: 'test', scope: 'dashboard' },
        controller1
      );
      scheduler.schedule(
        () => new Promise(() => {}),
        { channel: 'test', scope: 'dashboard' },
        controller2
      );
      scheduler.schedule(
        () => new Promise(() => {}),
        { channel: 'test', scope: 'analytics' },
        controller3
      );

      scheduler.abortScope('dashboard');

      expect(controller1.abort).toHaveBeenCalledTimes(1);
      expect(controller2.abort).toHaveBeenCalledTimes(1);
      expect(controller3.abort).not.toHaveBeenCalled();
    });
  });
});
