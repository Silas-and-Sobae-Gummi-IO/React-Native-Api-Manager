// src/client/ApiRequest.js

export class ApiRequest {
  static fromPromiseFactory(factory) {
    const req = new ApiRequest();
    req._start(factory);
    return req;
  }

  constructor() {
    this._abort = null;
    this._promise = null;
    this.id = Symbol('ApiRequest');
  }

  _start = async (factory) => {
    // factory returns another ApiRequest or Promise
    const result = await factory();
    if (result instanceof ApiRequest) {
      this._abort = () => result.abort();
      this._promise = result.promise;
    } else {
      // result assumed to be thenable; wrap
      this._promise = Promise.resolve(result);
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

  setAbort(fn) {
    this._abort = fn;
    return this;
  }

  abort() {
    if (this._abort) this._abort();
  }
}
