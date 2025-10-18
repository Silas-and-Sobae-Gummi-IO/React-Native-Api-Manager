// src/client/interceptors.test.js

import { InterceptorManager } from './internals/InterceptorManager'

describe('Hooks engine (InterceptorManager)', () => {
  it('applyFilters runs by priority and preserves value when handler returns undefined', async () => {
    const hooks = new InterceptorManager({})
    const calls = []
    hooks.addFilter('x', 'b', (v) => { calls.push('b'); return v + 'b' }, 20)
    hooks.addFilter('x', 'a', (v) => { calls.push('a'); return v + 'a' }, 10)
    hooks.addFilter('x', 'tap', () => { calls.push('tap'); return undefined }, 15)
    const out = await hooks.applyFilters('x', '', {})
    expect(out).toBe('ab')
    expect(calls).toEqual(['a', 'tap', 'b'])
  })

  it('doAction invokes all listeners', async () => {
    const hooks = new InterceptorManager({})
    const calls = []
    hooks.addAction('y', 'one', () => calls.push(1), 10)
    hooks.addAction('y', 'two', () => calls.push(2), 20)
    await hooks.doAction('y', {})
    expect(calls).toEqual([1, 2])
  })

  it('add(class) calls register and add(object) maps filters/actions', async () => {
    const hooks = new InterceptorManager({})
    class C { register(h, c) { h.addFilter('z', 'f', (v) => v + 'c', 10) } }
    hooks.add('classy', C)

    hooks.add('objecty', { filters: { z: (v) => v + 'o' }, actions: { a: () => {} } })

    const out = await hooks.applyFilters('z', '', {})
    expect(out).toBe('co')
  })
})
