// src/client/ApiClient.transformError.test.js

import { ApiClient } from './ApiClient';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';

jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');

describe('ApiClient - transformResponse error paths and onError interceptors', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    buildRequestConfig.mockImplementation((cfg) => ({ url: `https://api.test.com${cfg.url}`, method: cfg.method }));
    parseResponse.mockResolvedValue({ raw: true });
  });

  it('propagates transformResponse thrown error and triggers onError interceptors', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com' });

    const onErrorSpy = jest.fn((err) => undefined); // tap, do not replace
    client.configureInterceptor('+tap@10', { onError: onErrorSpy });

    const boom = new Error('boom');

    await expect(
      client.get('/x', {
        transformResponse: () => {
          throw boom;
        },
      })
    ).rejects.toThrow('boom');

    expect(onErrorSpy).toHaveBeenCalled();
  });

  it('allows onError interceptor to replace the error', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com' });

    client.configureInterceptor('+replacer@10', {
      onError: () => new Error('mapped'),
    });

    await expect(
      client.get('/y', {
        transformResponse: () => {
          throw new Error('orig');
        },
      })
    ).rejects.toThrow('mapped');
  });
});
