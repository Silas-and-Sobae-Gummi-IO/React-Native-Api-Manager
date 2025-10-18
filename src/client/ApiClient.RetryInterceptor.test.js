// src/client/RetryInterceptor.test.js

import { ApiClient } from './ApiClient'
import { buildRequestConfig } from './internals/requestBuilder'
import { parseResponse } from './internals/responseParser'

jest.mock('./internals/requestBuilder')
jest.mock('./internals/responseParser')

describe('RetryInterceptor', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.useFakeTimers()
    global.fetch = jest.fn()
  })
  afterEach(() => jest.useRealTimers())

  it('retries on 503 per retry config', async () => {
    const api = new ApiClient({ baseURL: 'https://api.test.com', retry: { attempts: 1, on: [503], delay: () => 500 } })

buildRequestConfig.mockImplementation((cfg) => ({ url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal }))

    // First call -> 503 triggers retry; second -> ok
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 })

parseResponse
      .mockRejectedValueOnce(Object.assign(new Error('503'), { name: 'ApiError', status: 503, response: { status: 503 } }))
      .mockResolvedValueOnce({ ok: true })

    const p = api.get('/svc')

    await jest.advanceTimersByTimeAsync(500)

    const result = await p
    expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(result).toEqual({ ok: true })
  })
})
