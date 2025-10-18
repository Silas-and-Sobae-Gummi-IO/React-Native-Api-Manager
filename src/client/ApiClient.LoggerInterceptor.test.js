// src/client/LoggerInterceptor.test.js

import { ApiClient } from './ApiClient'
import { buildRequestConfig } from './internals/requestBuilder'
import { parseResponse } from './internals/responseParser'

jest.mock('./internals/requestBuilder')
jest.mock('./internals/responseParser')

describe('LoggerInterceptor', () => {
  let logSpy
  beforeEach(() => {
    jest.resetAllMocks()
    global.fetch = jest.fn()
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => logSpy.mockRestore())

  it('logs when debug=true', async () => {
    const api = new ApiClient({ baseURL: 'https://api.test.com', debug: true })
buildRequestConfig.mockImplementation((cfg) => ({ url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal }))
    global.fetch.mockResolvedValue({ ok: true, status: 200 })
    parseResponse.mockResolvedValue({ ok: true })

await api.get('/users')
    expect(logSpy.mock.calls.length).toBeGreaterThan(0)
  })

  it('does not log when debug=false', async () => {
    const api = new ApiClient({ baseURL: 'https://api.test.com', debug: false })
buildRequestConfig.mockImplementation((cfg) => ({ url: `https://api.test.com${cfg.url}`, method: cfg.method, signal: cfg.signal }))
    global.fetch.mockResolvedValue({ ok: true, status: 200 })
    parseResponse.mockResolvedValue({ ok: true })

    await api.get('/users')
    expect(logSpy).not.toHaveBeenCalled()
  })
})
