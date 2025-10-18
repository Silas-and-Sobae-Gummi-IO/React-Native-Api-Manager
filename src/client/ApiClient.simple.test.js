// src/client/simple.test.js

import {ApiClient} from './ApiClient';
import {buildRequestConfig} from './internals/requestBuilder';
import {parseResponse} from './internals/responseParser';

jest.mock('./internals/requestBuilder');
jest.mock('./internals/responseParser');

describe('ApiClient - simple basics', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it('performs a basic GET and returns parsed data', async () => {
    const api = new ApiClient({baseURL: 'https://api.test.com'});
    buildRequestConfig.mockImplementation((cfg) => ({url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal}));
    global.fetch.mockResolvedValue({ok: true, status: 200});
    parseResponse.mockResolvedValue({ok: true});

    const res = await api.get('/ok');
    expect(res).toEqual({ok: true});
    expect(global.fetch).toHaveBeenCalled();
  });

  it('applies headers filter and shorthand filter', async () => {
    const api = new ApiClient({baseURL: 'https://api.test.com'});
    api.addFilter('headers', 'auth', (headers) => ({...headers, authorization: 'Bearer X'}));
    api.addFilter('shorthand', 'prefix', (parsed) => ({...parsed, url: `/v1${parsed.url}`}));

    buildRequestConfig.mockImplementation((cfg) => ({url: `https://api.test.com${cfg.url}`, method: cfg.method, headers: cfg.headers}));
    global.fetch.mockResolvedValue({ok: true, status: 200});
    parseResponse.mockResolvedValue({ok: true});

    await api.request('get:/users');
    expect(buildRequestConfig).toHaveBeenCalledWith(expect.objectContaining({headers: expect.objectContaining({authorization: 'Bearer X'}), url: '/v1/users'}));
  });

  it('maps timeout AbortError to ApiError and calls final', async () => {
    const api = new ApiClient({baseURL: 'https://api.test.com', timeout: 10});

    buildRequestConfig.mockImplementation((cfg) => ({url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal}));
    global.fetch.mockImplementation((url, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject({name: 'AbortError'}));
    }));

    const finalSpy = jest.fn();
    api.addAction('final', 'spy', finalSpy);

    await expect(api.get('/slow')).rejects.toThrow('Request timed out after 10ms');
    expect(finalSpy).toHaveBeenCalled();
  });

  it('manual abort via handle.abort()', async () => {
    const api = new ApiClient({baseURL: 'https://api.test.com'});
    buildRequestConfig.mockImplementation((cfg) => ({url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal}));

    let savedSignal;
    global.fetch.mockImplementation((url, opts) => new Promise((resolve, reject) => {
      savedSignal = opts.signal;
      opts.signal.addEventListener('abort', () => reject({ name: 'AbortError' }))
    }));

    const req = api.get('/hanging');
    req.abort();
    await expect(req).rejects.toThrow(/AbortError/);
    expect(savedSignal.aborted).toBe(true);
  });
});
