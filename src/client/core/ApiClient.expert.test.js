// src/client/core/ApiClient.expert.test.js

import {ApiClient} from './ApiClient';

describe('ApiClient - Expert Features', () => {
  describe('Shorthand URL Syntax', () => {
    it('parses "get:users" as GET request', async () => {
      // TODO: Test client.request('get:users') => GET /users
    });

    it('parses "post:users" as POST request', async () => {
      // TODO: Test client.request('post:users', {body}) => POST /users
    });

    it('parses "put:users/1" as PUT request', async () => {
      // TODO: Test client.request('put:users/1', {body}) => PUT /users/1
    });

    it('defaults to GET when no method prefix is provided', async () => {
      // TODO: Test client.request('users') => GET /users
    });

    it('preserves colons in URL path after method prefix', async () => {
      // TODO: Test client.request('post:auth:login') => POST /auth:login
    });
  });

  describe('Shorthand Interceptor Syntax', () => {
    it('supports +interceptor@priority syntax to add hooks', () => {
      // TODO: Test adding interceptor with priority using shorthand
      // e.g., config: { hooks: { '+logger@20': callback } }
    });

    it('supports -interceptor syntax to remove hooks', () => {
      // TODO: Test removing interceptor using shorthand
      // e.g., config: { hooks: { '-logger': null } }
    });

    it('supports ~interceptor syntax to replace hooks', () => {
      // TODO: Test replacing interceptor using shorthand
      // e.g., config: { hooks: { '~logger': callback } }
    });
  });

  describe('Custom Interceptors', () => {
    it('attaches custom interceptor classes from config', () => {
      // TODO: Test passing custom interceptor in config.interceptors array
    });

    it('allows registering ad-hoc hooks via config.hooks', () => {
      // TODO: Test registering individual hooks without full interceptor class
    });

    it('respects hook priority ordering', () => {
      // TODO: Test that hooks with lower priority run first
    });
  });

  describe('Request-level Interceptor Manipulation', () => {
    it('allows removing interceptors for a single request', () => {
      // TODO: Test client.post('/users', {body}, {interceptors: ['-logger']})
      // Should execute without logger interceptor, but logger still present for other requests
    });

    it('allows adding interceptors for a single request', () => {
      // TODO: Test adding a custom interceptor only for specific request
      // May require fork() or temporary attach mechanism
    });

    it('merges client-level and request-level interceptor configs', () => {
      // TODO: Test that request-level interceptors merge with client-level
      // Example: client has [A, B], request adds [C, '-B'] => final is [A, C]
    });
  });

  describe('Advanced Request Configuration', () => {
    it('supports channel-based request scheduling', async () => {
      // TODO: Test config: { channel: 'background' } for concurrency control
    });

    it('supports scoped request cancellation', async () => {
      // TODO: Test config: { scope: 'dashboard' } for bulk abort
    });

    it('supports request priority ordering', async () => {
      // TODO: Test config: { priority: 10 } for queue ordering
    });

    it('supports cancelKey for duplicate request prevention', async () => {
      // TODO: Test config: { cancelKey: 'user-profile' } to auto-cancel previous
    });
  });
});
