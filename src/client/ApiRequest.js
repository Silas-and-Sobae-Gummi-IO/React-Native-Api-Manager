// src/client/ApiRequest.js

/**
 * ApiRequest
 * A thenable handle wrapping an in-flight request, exposing abort().
 */
export class ApiRequest {
/**
   * Create an ApiRequest from a factory that produces a Promise or another ApiRequest.
   * @param {() => Promise<any> | ApiRequest} factory
   */
  static fromPromiseFactory(factory) {
    const req = new ApiRequest();
    req._start(factory);
    return req;
  }

  constructor() {
    this._abort = null;
    this._promise = null;
    this._pendingAbort = false;
    this.id = Symbol('ApiRequest');
  }

  _start = (factory) => {
    // factory returns another ApiRequest or Promise
    try {
      const result = factory();
      if (result instanceof ApiRequest) {
        this._abort = () => result.abort();
        this._promise = result.promise;
      } else {
        this._promise = Promise.resolve(result);
      }
    } catch (e) {
      this._promise = Promise.reject(e);
    }
  };

  then(onFulfilled, onRejected) {
    return this.promise.then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.promise.catch(onRejected);
  }

  finally(onFinally) {
    return this.promise.finally(onFinally);
  }

  get promise() {
    return this._promise || Promise.reject(new Error('Request not started'));
  }

/**
   * Set the abort function wired to the underlying AbortController.
   * @param {() => void} fn
   * @returns {this}
   */
  setAbort(fn) {
    this._abort = fn;
    if (this._pendingAbort) {
      this._pendingAbort = false;
      try { this._abort(); } catch (_) {}
    }
    return this;
  }

  abort() {
    if (this._abort) this._abort();
    else this._pendingAbort = true;
  }
}
