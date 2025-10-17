// src/agent/internals/RequestScheduler.test.js

import { RequestScheduler } from './RequestScheduler';

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

      // Schedule both tasks. Task2 should be queued.
      const promise1 = scheduler.schedule(task1, { channel: 'test' }, {});
      const promise2 = scheduler.schedule(task2, { channel: 'test' }, {});

      // Immediately, only task1 should be called
      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).not.toHaveBeenCalled();

      // After task1 completes, task2 should be called
      await promise1;
      expect(task2).toHaveBeenCalledTimes(1);

      // Final results should be correct
      await expect(promise1).resolves.toBe('done1');
      await expect(promise2).resolves.toBe('done2');
    });
  });

  describe('Pausing and Resuming', () => {
    it('should queue requests on a paused channel and run them on resume', async () => {
      scheduler.configureChannels({ test: { concurrency: 1 } });
      const task = jest.fn(() => Promise.resolve('done'));

      scheduler.pauseChannel('test');
      const promise = scheduler.schedule(task, { channel: 'test' }, {});

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

      const controller1 = { abort: jest.fn() };
      const controller2 = { abort: jest.fn() };
      const controller3 = { abort: jest.fn() };

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
