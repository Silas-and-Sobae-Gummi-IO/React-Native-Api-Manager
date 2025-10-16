import { serializeParams } from './url';

describe('serializeParams - Converts an object into a URL query string', () => {
  it('should correctly serialize a simple object', () => {
    const params = { page: 2, sort: 'asc' };
    expect(serializeParams(params)).toBe('?page=2&sort=asc');
  });

  it('should correctly URL-encode special characters in keys and values', () => {
    const params = { q: 'hello world', 'filter[type]': 'posts' };
    expect(serializeParams(params)).toBe(
      '?q=hello%20world&filter%5Btype%5D=posts'
    );
  });

  it('should return an empty string for an empty object', () => {
    expect(serializeParams({})).toBe('');
  });

  it('should return an empty string for null or undefined input', () => {
    expect(serializeParams(null)).toBe('');
    expect(serializeParams(undefined)).toBe('');
  });

  it('should ignore keys with null or undefined values', () => {
    const params = { page: 2, filter: undefined, sort: 'asc', query: null };
    expect(serializeParams(params)).toBe('?page=2&sort=asc');
  });

  it('should handle numeric and boolean values correctly', () => {
    const params = { page: 1, active: true, count: 0 };
    expect(serializeParams(params)).toBe('?page=1&active=true&count=0');
  });

  it('should serialize an array by repeating the key for each value', () => {
    const params = { ids: [1, 2, 3], status: 'active' };
    expect(serializeParams(params)).toBe('?ids=1&ids=2&ids=3&status=active');
  });
});
