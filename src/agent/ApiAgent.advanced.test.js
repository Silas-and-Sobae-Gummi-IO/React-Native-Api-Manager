// src/agent/ApiAgent.advanced.test.js

import { ApiAgent } from './ApiAgent';
import { ApiClient } from '../client/ApiClient';

// THE FIX: Mock global.fetch for the entire test suite.
global.fetch = jest.fn();

describe('ApiAgent - Advanced Schedulers & Controllers', () => {
  let testAgent;
  let performFetchSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    testAgent = new ApiAgent();
    testAgent.setGlobalConfig({ baseURL: 'https://api.test.com' });

    // THE FIX: Provide a default "hanging promise" implementation for fetch.
    // This is perfect for testing schedulers and cancellations.
    global.fetch.mockReturnValue(new Promise(() => {}));

    performFetchSpy = jest.spyOn(ApiClient.prototype, '_performFetch');
  });

  afterEach(() => {
    performFetchSpy.mockRestore();
  });

  describe('Request Channels & Concurrency', () => {
    it('should queue a request if the channel concurrency is full', async () => {
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
      client.get('/request2');

      expect(performFetchSpy).toHaveBeenCalledTimes(1);

      resolveRequest1('data1');
      await promise1;
      await new Promise(process.nextTick);

      expect(performFetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Pausing & Resuming', () => {
    it('should prevent requests on a paused channel from being sent', async () => {
      testAgent.configureChannels({ default: { concurrency: 1 } });
      const client = testAgent.createClient('default');

      testAgent.pauseChannel('default');
      client.get('/request1');

      await new Promise(process.nextTick);
      expect(performFetchSpy).not.toHaveBeenCalled();

      testAgent.resumeChannel('default');
      await new Promise(process.nextTick);
      expect(performFetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scoped Request Cancellation', () => {
    it('should call the schedulers abortScope method', () => {
      // This test doesn't make a real request, so it's fine as is.
      const schedulerAbortSpy = jest.spyOn(testAgent.scheduler, 'abortScope');
      testAgent.abortScope('dashboard');
      expect(schedulerAbortSpy).toHaveBeenCalledWith('dashboard');
    });
  });
});
