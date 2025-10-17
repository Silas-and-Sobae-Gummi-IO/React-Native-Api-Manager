// src/agent/ApiAgent.advanced.test.js

import { ApiAgent } from './ApiAgent';
import { ApiClient } from '../client/ApiClient';

global.fetch = jest.fn();

describe('ApiAgent - Advanced Schedulers & Controllers', () => {
  let testAgent;
  let performFetchSpy;

  beforeEach(() => {
    jest.useFakeTimers(); // Enable for the suite
    jest.clearAllMocks();
    testAgent = new ApiAgent();
    testAgent.setGlobalConfig({ baseURL: 'https://api.test.com' });
    global.fetch.mockReturnValue(new Promise(() => {}));
    performFetchSpy = jest.spyOn(ApiClient.prototype, '_performFetch');
  });

  afterEach(() => {
    performFetchSpy.mockRestore();
    jest.useRealTimers(); // Restore after each test
  });

  describe('Request Channels & Concurrency', () => {
    it.skip('should queue a request if the channel concurrency is full', async () => {
      testAgent.configureChannels({ default: { concurrency: 1 } });
      const client = testAgent.createClient('default');

      let resolveRequest1;
      performFetchSpy
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveRequest1 = resolve;
            })
        )
        .mockImplementationOnce(() => Promise.resolve('data2'));

      const promise1 = client.get('/request1');
      const promise2 = client.get('/request2');

      // Wait for scheduler to process the first item
      await jest.advanceTimersByTimeAsync(0);
      expect(performFetchSpy).toHaveBeenCalledTimes(1);

      resolveRequest1('data1');
      await promise1; // Wait for the first promise to fully resolve

      // IMPORTANT: Wait for the scheduler's finally block and next processing tick
      await jest.advanceTimersByTimeAsync(0);

      expect(performFetchSpy).toHaveBeenCalledTimes(2); // Now the second should have run
      await expect(promise2).resolves.toBe('data2');
    });
  });

  describe('Pausing & Resuming', () => {
    it.skip('should prevent requests on a paused channel from being sent', async () => {
      // Fake timers are already enabled by the top-level beforeEach
      testAgent.configureChannels({ default: { concurrency: 1 } });
      const client = testAgent.createClient('default');
      performFetchSpy.mockResolvedValue('data');

      testAgent.pauseChannel('default');
      const promise1 = client.get('/request1');

      // Run any pending timers/microtasks - fetch should NOT be called
      await jest.advanceTimersByTimeAsync(0);
      expect(performFetchSpy).not.toHaveBeenCalled();

      testAgent.resumeChannel('default');

      // Run all timers to allow queue processing fully
      await jest.runAllTimersAsync();

      expect(performFetchSpy).toHaveBeenCalledTimes(1);
      await expect(promise1).resolves.toBe('data');
    });
  });

  describe('Scoped Request Cancellation', () => {
    it('should call the schedulers abortScope method', () => {
      const schedulerAbortSpy = jest.spyOn(testAgent.scheduler, 'abortScope');
      testAgent.abortScope('dashboard');
      expect(schedulerAbortSpy).toHaveBeenCalledWith('dashboard');
    });
  });
});
