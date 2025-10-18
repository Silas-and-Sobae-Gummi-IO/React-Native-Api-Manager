// src/client/ApiClient.headers.test.js

import { ApiClient } from './ApiClient';
import { buildRequestConfig } from './internals/requestBuilder';
import { parseResponse } from './internals/responseParser';

jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');

describe('ApiClient - headers merging', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    parseResponse.mockResolvedValue({ ok: true });
  });

  it('merges instance and per-request headers and normalizes case', async () => {
    const client = new ApiClient({ baseURL: 'https://api.test.com', headers: { Accept: 'application/json', 'X-Token': '1' } });

    buildRequestConfig.mockImplementation((cfg) => ({ url: `https://api.test.com${cfg.url}`, method: cfg.method, headers: cfg.headers }));

    await client.get('/merge', { headers: { authorization: 'Bearer AAA', 'x-token': '2' } });

    expect(buildRequestConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          accept: 'application/json',
          authorization: 'Bearer AAA',
          'x-token': '2',
        },
      })
    );
  });
});
