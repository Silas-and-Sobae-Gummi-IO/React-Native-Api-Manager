import {RecoveryInterceptor} from './RecoveryInterceptor';
import {ApiClient} from '../core/ApiClient';

describe('RecoveryInterceptor', () => {
  let mockFetch;

  const mockSuccess = (data) => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]),
    text: async () => JSON.stringify(data),
  });

  const mockError = (status, data) => ({
    ok: false,
    status,
    headers: new Map([['content-type', 'application/json']]),
    text: async () => JSON.stringify(data),
  });

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('object-based config works with named handlers', async () => {
    const authHandler = jest.fn().mockResolvedValue();

    mockFetch.mockResolvedValueOnce(mockError(401, {error: 'Unauthorized'})).mockResolvedValueOnce(mockSuccess({data: 'success'}));

    const client = new ApiClient({
      baseURL: 'https://api.test.com',
      recovery: {
        auth: {
          shouldRetry: (error) => error.status === 401,
          handler: authHandler,
        },
      },
    });

    const result = await client.get('/test').send();

    expect(authHandler).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({data: 'success'});
  });

  test('enables handlers by default', async () => {
    const handler = jest.fn().mockResolvedValue();

    mockFetch.mockResolvedValueOnce(mockError(401, {error: 'Unauthorized'})).mockResolvedValueOnce(mockSuccess({data: 'success'}));

    const client = new ApiClient({
      baseURL: 'https://api.test.com',
      recovery: {
        auth: {
          // enable: true is default
          shouldRetry: (error) => error.status === 401,
          handler,
        },
      },
    });

    await client.get('/test').send();
    expect(handler).toHaveBeenCalled();
  });

  test('can disable handler per-request', async () => {
    const handler = jest.fn().mockResolvedValue();

    mockFetch.mockResolvedValueOnce(mockError(401, {error: 'Unauthorized'}));

    const client = new ApiClient({
      baseURL: 'https://api.test.com',
      recovery: {
        auth: {
          shouldRetry: (error) => error.status === 401,
          handler,
        },
      },
    });

    // Disable auth recovery for this request
    await expect(
      client
        .get('/public', {
          recovery: {
            auth: {enable: false},
          },
        })
        .send()
    ).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });

  test('deep merges recovery configs', async () => {
    const authHandler = jest.fn().mockResolvedValue();
    const deviceHandler = jest.fn().mockResolvedValue();

    mockFetch.mockResolvedValueOnce(mockError(403, {error: 'Device not registered'})).mockResolvedValueOnce(mockSuccess({data: 'success'}));

    // Simulate agent config
    const agentConfig = {
      recovery: {
        auth: {
          shouldRetry: (error) => error.status === 401,
          handler: authHandler,
        },
      },
    };

    // Client adds device handler
    const client = new ApiClient({
      baseURL: 'https://api.test.com',
      ...agentConfig,
      recovery: {
        ...agentConfig.recovery,
        device: {
          shouldRetry: (error) => error.status === 403,
          handler: deviceHandler,
        },
      },
    });

    await client.get('/test').send();

    // Device handler should run
    expect(deviceHandler).toHaveBeenCalled();
    expect(authHandler).not.toHaveBeenCalled();
  });

  test('populates default values for missing properties', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccess({data: 'success'}));

    const client = new ApiClient({
      baseURL: 'https://api.test.com',
      recovery: {
        incomplete: {
          // Missing shouldRetry, handler, etc.
        },
      },
    });

    // Should not throw - defaults should be populated
    const result = await client.get('/test').send();
    expect(result).toEqual({data: 'success'});
  });

  test('multiple handlers work together', async () => {
    const authHandler = jest.fn().mockResolvedValue();
    const deviceHandler = jest.fn().mockResolvedValue();

    // First request: 401
    mockFetch.mockResolvedValueOnce(mockError(401, {error: 'Unauthorized'})).mockResolvedValueOnce(mockSuccess({data: 'auth recovered'}));

    const client = new ApiClient({
      baseURL: 'https://api.test.com',
      recovery: {
        auth: {
          shouldRetry: (error) => error.status === 401,
          handler: authHandler,
        },
        device: {
          shouldRetry: (error) => error.status === 403,
          handler: deviceHandler,
        },
      },
    });

    await client.get('/test1').send();
    expect(authHandler).toHaveBeenCalledTimes(1);
    expect(deviceHandler).not.toHaveBeenCalled();

    // Second request: 403
    mockFetch.mockResolvedValueOnce(mockError(403, {error: 'Device error'})).mockResolvedValueOnce(mockSuccess({data: 'device recovered'}));

    await client.get('/test2').send();
    expect(authHandler).toHaveBeenCalledTimes(1); // Still 1
    expect(deviceHandler).toHaveBeenCalledTimes(1);
  });
});
