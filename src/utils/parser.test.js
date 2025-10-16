import { parseShorthandUrl, parseInterceptorShorthand } from './parser';

describe('parseShorthandUrl - Parses request URL and method from shorthand syntax', () => {
  // Test case for each valid HTTP method
  it.each([
    ['get', 'users'],
    ['post', 'users'],
    ['put', 'users/1'],
    ['patch', 'users/1'],
    ['delete', 'users/1'],
  ])('should correctly parse the "%s" method', (method, url) => {
    expect(parseShorthandUrl(`${method}:${url}`)).toEqual({ method, url });
  });

  it('should be case-insensitive for the method', () => {
    expect(parseShorthandUrl('DELETE:users/1')).toEqual({
      method: 'delete',
      url: 'users/1',
    });
  });

  it('should default to GET if no method is provided', () => {
    expect(parseShorthandUrl('users')).toEqual({ method: 'get', url: 'users' });
  });

  it('should default to GET for an unrecognized or invalid method', () => {
    expect(() => {
      parseShorthandUrl('fetch:users');
    }).toThrow('Invalid shorthand method: fetch');
  });

  it('should handle urls that contain colons', () => {
    // Edge case for URLs with their own protocol or complex paths
    expect(parseShorthandUrl('get:http://example.com')).toEqual({
      method: 'get',
      url: 'http://example.com',
    });
  });
});

describe('parseInterceptorShorthand - Parses interceptor management commands', () => {
  it('should parse an "add" action with a specific priority', () => {
    expect(parseInterceptorShorthand('+logger@20')).toEqual({
      action: 'add',
      name: 'logger',
      priority: 20,
    });
  });

  it('should parse an "add" action with the default priority of 10', () => {
    expect(parseInterceptorShorthand('+auth')).toEqual({
      action: 'add',
      name: 'auth',
      priority: 10,
    });
  });

  it('should parse a "remove" action', () => {
    expect(parseInterceptorShorthand('-logger')).toEqual({
      action: 'remove',
      name: 'logger',
    });
  });

  it('should parse a "replace" action', () => {
    expect(parseInterceptorShorthand('~cache')).toEqual({
      action: 'replace',
      name: 'cache',
    });
  });

  it('should return null for an invalid or malformed shorthand string', () => {
    expect(parseInterceptorShorthand('invalid-string')).toBeNull();
    expect(parseInterceptorShorthand('@logger')).toBeNull();
    expect(parseInterceptorShorthand('+@10')).toBeNull();
  });
});
