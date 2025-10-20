// src/client/interceptors/StatusHandlerInterceptor.test.js

import {StatusHandlerInterceptor} from './StatusHandlerInterceptor';
import {ApiClient} from '../ApiClient';

describe('StatusHandlerInterceptor', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({data: 'default'}),
        text: () => Promise.resolve(JSON.stringify({data: 'default'})),
      })
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is registered as a built-in interceptor', () => {
    const client = new ApiClient();

    expect(client.interceptors.providers.has('statusHandler')).toBe(true);
  });

  it('calls custom onStatus handler for matching status code', async () => {
    const handler = jest.fn(() => ({custom: 'response'}));
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({error: 'Validation failed'}),
    });

    const client = new ApiClient();
    const request = client.post('https://api.example.com/users', {email: 'bad'}, {
      onStatus: {422: handler},
    });

    const result = await request.send();

    expect(handler).toHaveBeenCalled();
    expect(result).toEqual({custom: 'response'});
  });

  it('bypasses default error handling when onStatus handler exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({error: 'Not Found'}),
    });

    const client = new ApiClient();
    const request = client.get('https://api.example.com/users/999', {
      onStatus: {404: () => 'handled'},
    });

    // Should NOT throw error because onStatus handler returns a value
    await expect(request.send()).resolves.toBe('handled');
  });

  it('passes through to parseResponse when no onStatus handler matches', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve(JSON.stringify({id: 1, name: 'Test'})),
    });

    const client = new ApiClient();
    const request = client.get('https://api.example.com/users/1', {
      onStatus: {404: () => 'not called'},
    });

    const result = await request.send();

    // Normal parsing should happen
    expect(result).toEqual({id: 1, name: 'Test'});
  });

  it('allows onStatus to return transformed data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({error: 'Unauthorized'}),
    });

    const client = new ApiClient();
    const request = client.get('https://api.example.com/protected', {
      onStatus: {
        401: (response) => ({
          redirectTo: '/login',
          status: response.status,
        }),
      },
    });

    const result = await request.send();

    expect(result).toEqual({
      redirectTo: '/login',
      status: 401,
    });
  });

  it('supports async onStatus handlers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({error: 'Service Unavailable'}),
    });

    const client = new ApiClient();
    const request = client.get('https://api.example.com/health', {
      onStatus: {
        503: async (response) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {retry: true, status: response.status};
        },
      },
    });

    const result = await request.send();

    expect(result).toEqual({retry: true, status: 503});
  });
});
