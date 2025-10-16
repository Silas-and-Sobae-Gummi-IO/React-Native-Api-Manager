import { mergeHeaders } from './headers';

describe('mergeHeaders - Merges multiple header objects into a single object', () => {
  it('should merge two simple header objects', () => {
    const defaultHeaders = { Accept: 'application/json' };
    const requestHeaders = { 'Content-Type': 'application/json' };
    const expected = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    expect(mergeHeaders(defaultHeaders, requestHeaders)).toEqual(expected);
  });

  it('should overwrite earlier headers with later ones, ignoring case', () => {
    const defaultHeaders = { Accept: 'application/xml', 'X-Token': '123' };
    const instanceHeaders = { accept: 'application/json' };
    const requestHeaders = { 'x-token': '456' };
    const expected = { accept: 'application/json', 'x-token': '456' };
    expect(
      mergeHeaders(defaultHeaders, instanceHeaders, requestHeaders)
    ).toEqual(expected);
  });

  it('should return an empty object if no headers are provided', () => {
    expect(mergeHeaders()).toEqual({});
  });

  it('should filter out headers with null or undefined values', () => {
    const headers = {
      Accept: 'application/json',
      Authorization: undefined,
      'Content-Type': null,
    };
    const expected = { accept: 'application/json' };
    expect(mergeHeaders(headers)).toEqual(expected);
  });

  it('should handle empty or null header objects gracefully', () => {
    const defaultHeaders = { Accept: 'application/json' };
    const requestHeaders = { 'X-Request-ID': 'abc' };
    const expected = { accept: 'application/json', 'x-request-id': 'abc' };
    expect(
      mergeHeaders(defaultHeaders, null, undefined, requestHeaders)
    ).toEqual(expected);
  });
});
