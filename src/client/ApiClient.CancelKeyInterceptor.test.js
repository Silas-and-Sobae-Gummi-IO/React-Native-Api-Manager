// src/client/CancelKeyInterceptor.test.js

import { ApiClient } from './ApiClient'
import { buildRequestConfig } from './internals/requestBuilder'
import { parseResponse } from './internals/responseParser'

jest.mock('./internals/requestBuilder')
jest.mock('./internals/responseParser')

describe('CancelKeyInterceptor', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    global.fetch = jest.fn()
  })

  it('aborts previous request sharing cancelKey', async () => {
    const api = new ApiClient({ baseURL: 'https://api.test.com' })
buildRequestConfig.mockImplementation((cfg) => ({ url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal }))

    let firstSignal
    global.fetch.mockImplementationOnce((url, opts) => {
      firstSignal = opts.signal
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject({ name: 'AbortError' }))
      })
    })

    const req1 = api.get('/slow', { cancelKey: 'search' })

    global.fetch.mockResolvedValueOnce({ ok: true, status: 200 })
    parseResponse.mockResolvedValueOnce({ ok: true })

    const req2 = api.get('/fast', { cancelKey: 'search' })

    await expect(req1).rejects.toThrow(/AbortError/)
    await expect(req2).resolves.toEqual({ ok: true })
    expect(firstSignal.aborted).toBe(true)
  })
})
