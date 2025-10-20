// src/client/interceptors/LoggerInterceptor.js
import {BaseInterceptor} from './BaseInterceptor';

export class LoggerInterceptor extends BaseInterceptor {
  static name = 'logger';
  static defaultConfig = {
    enable: false,
    scope: '*',
  };
  
  configKey = 'debug';

  register() {
    this._useShorthandConfig();
    
    this._manager.add('request:beforeRequest', 'logger:req', this._onBeforeRequest.bind(this), 999);
    this._manager.add('request:onResponse', 'logger:res', this._onResponse.bind(this), 999);
  }

  _shouldLog(scope = null) {
    if (!this._client?.config?.debug?.enable) {
      return false;
    }

    const clientScope = this._client?.config?.debug?.scope;
    return scope === null ? true : clientScope === '*' || clientScope?.includes(scope);
  }

  _onBeforeRequest({options, url}) {
    this._shouldLog() && console.log(`[API beforeFetch] ${options.method.toUpperCase()} -> ${url}`);
  }

  _onResponse(payload) {
    this._shouldLog() && console.log(`[API Response] ${payload.ok ? 'success' : 'error'}`, payload);
  }
}
