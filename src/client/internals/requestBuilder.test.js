// src/client/internals/requestBuilder.test.js

import { buildRequestConfig } from './requestBuilder';

// We mock our own utilities to test the builder in isolation.
jest.mock('../../utils/url', () => ({
  serializeParams: jest.fn((params) => (params ? '?serialized=true' : '')),
}));
jest.mock('../../utils/headers', () => ({
  mergeHeaders: jest.fn((...sources) =>
    sources.reduce((acc, src) => ({ ...acc, ...src }), {})
  ),
}));

describe('buildRequestConfig - Composes the final config for a fetch request', () => {
  const baseURL = 'https://api.example.com';

  it('should correctly combine a baseURL and a relative URL', () => {
    const config = {
      method: 'GET',
      baseURL: `${baseURL}/v1`,
      url: '/users',
    };
    const { url } = buildRequestConfig(config);
    expect(url).toBe('https://api.example.com/v1/users');
  });

  it('should append serialized query parameters to the URL', () => {
    const config = {
      method: 'GET',
      baseURL,
      url: '/users',
      params: { page: 2 },
    };
    const { url } = buildRequestConfig(config);
    expect(url).toBe('https://api.example.com/users?serialized=true');
  });

  it('should JSON.stringify an object body and set the Content-Type header', () => {
    const body = { name: 'John Doe' };
    const config = { method: 'POST', url: '/users', body, baseURL }; // Added baseURL

    const { body: finalBody, headers } = buildRequestConfig(config);

    expect(finalBody).toBe('{"name":"John Doe"}');
    expect(headers['content-type']).toBe('application/json');
  });

  it('should handle a request with both a JSON body and query parameters', () => {
    const bodyPayload = { title: 'New Post', content: 'Hello World' };
    const paramsPayload = { notify: true, priority: 'high' };

    const config = {
      method: 'POST',
      baseURL,
      url: '/posts',
      body: bodyPayload,
      params: paramsPayload,
    };

    const { url: finalUrl, body: finalBody } = buildRequestConfig(config);

    // Assert the URL correctly includes the serialized query string
    expect(finalUrl).toBe('https://api.example.com/posts?serialized=true');

    // Assert the body is the correctly stringified JSON payload
    expect(finalBody).toBe(JSON.stringify(bodyPayload));

    // We can also verify that our mocked serializeParams function was called correctly
    const { serializeParams } = require('../../utils/url');
    expect(serializeParams).toHaveBeenCalledWith(paramsPayload);
  });

  it('should NOT set Content-Type for a FormData body', () => {
    const formData = new FormData();
    formData.append('key', 'value');

    const config = { method: 'POST', url: '/upload', body: formData, baseURL }; // Added baseURL

    const { body: finalBody, headers } = buildRequestConfig(config);
    expect(finalBody).toBe(formData);
    expect(headers['content-type']).toBeUndefined();
  });

  it('should automatically convert a plain object to FormData if it contains a file-like object', () => {
    const mockFile = {
      uri: 'file:///path/to/image.jpg',
      name: 'image.jpg',
      type: 'image/jpeg',
    };
    const bodyPayload = {
      userId: 123,
      caption: 'A test caption',
      attachment: mockFile,
    };
    const config = {
      method: 'POST',
      url: '/upload',
      body: bodyPayload,
      baseURL,
    }; // Added baseURL
    const { body: finalBody, headers } = buildRequestConfig(config);
    expect(finalBody).toBeInstanceOf(FormData);
    expect(headers['content-type']).toBeUndefined();
  });

  it('should correctly handle an array of files for multi-uploads', () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const mockFile1 = {
      uri: 'file:///1.jpg',
      name: '1.jpg',
      type: 'image/jpeg',
    };
    const mockFile2 = {
      uri: 'file:///2.jpg',
      name: '2.jpg',
      type: 'image/jpeg',
    };
    const bodyPayload = {
      userId: 456,
      attachments: [mockFile1, mockFile2],
    };
    const config = {
      method: 'POST',
      url: '/upload-multiple',
      body: bodyPayload,
      baseURL,
    }; // Added baseURL
    buildRequestConfig(config);
    expect(appendSpy).toHaveBeenCalledWith('userId', 456);
    expect(appendSpy).toHaveBeenCalledWith('attachments', mockFile1);
    expect(appendSpy).toHaveBeenCalledWith('attachments', mockFile2);
    appendSpy.mockRestore();
  });

  it('should detect a file even when it is nested inside an array', () => {
    const mockFile = {
      uri: 'file:///nested.jpg',
      name: 'nested.jpg',
      type: 'image/jpeg',
    };
    const bodyPayload = {
      items: [
        { id: 1, type: 'text' },
        { id: 2, type: 'image', file: mockFile },
      ],
    };
    const config = {
      method: 'POST',
      url: '/upload-nested',
      body: bodyPayload,
      baseURL,
    }; // Added baseURL
    const { body: finalBody } = buildRequestConfig(config);
    expect(finalBody).toBeInstanceOf(FormData);
  });
});
