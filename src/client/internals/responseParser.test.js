// src/client/internals/responseParser.test.js

import {parseResponse} from './responseParser';
import {ApiError} from '../../core/ApiError';

describe('responseParser', () => {
  const mockConfig = {method: 'GET', url: '/test'};

  describe('JSON response parsing', () => {
    it('parses valid JSON response with application/json content-type', async () => {
      const data = {id: 1, name: 'Test'};
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify(data)),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toEqual(data);
    });

    it('parses JSON with charset in content-type', async () => {
      const data = {message: 'success'};
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json; charset=utf-8']]),
        text: () => Promise.resolve(JSON.stringify(data)),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toEqual(data);
    });

    it('parses JSON with vendor-specific content-type', async () => {
      const data = {items: []};
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/vnd.api+json']]),
        text: () => Promise.resolve(JSON.stringify(data)),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toEqual(data);
    });
  });

  describe('204 No Content handling', () => {
    it('returns null for 204 status', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        headers: new Map(),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toBeNull();
    });

    it('returns null when content-length is 0', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-length', '0']]),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toBeNull();
    });
  });

  describe('autoFixJson feature', () => {
    it('fixes malformed JSON with PHP warning prefix when autoFixJson is true', async () => {
      const malformedText = 'PHP Warning: something\n\n{"id": 1, "status": "ok"}';
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn(() => Promise.resolve(malformedText)),
      };
      const config = {...mockConfig, autoFixJson: true};

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await parseResponse(mockResponse, config);

      expect(result).toEqual({id: 1, status: 'ok'});
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Malformed JSON'));

      consoleWarnSpy.mockRestore();
    });

    it('fixes JSON with leading whitespace and text', async () => {
      const malformedText = '   Debug: request started\n[1, 2, 3]';
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn(() => Promise.resolve(malformedText)),
      };
      const config = {...mockConfig, autoFixJson: true};

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await parseResponse(mockResponse, config);

      expect(result).toEqual([1, 2, 3]);

      consoleWarnSpy.mockRestore();
    });

    it('throws ApiError if autoFixJson is true but JSON still cannot be fixed', async () => {
      const invalidText = 'PHP Warning: {"id": 1, "incomplete';
      const mockResponse = {
        ok: false,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(invalidText),
      };
      const config = {...mockConfig, autoFixJson: true};

      await expect(parseResponse(mockResponse, config)).rejects.toThrow(ApiError);
    });

    it('throws ApiError immediately when autoFixJson is false', async () => {
      const malformedText = 'Debug: {"id": 1}';
      const mockResponse = {
        ok: false,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(malformedText),
      };
      const config = {...mockConfig, autoFixJson: false};

      await expect(parseResponse(mockResponse, config)).rejects.toThrow(ApiError);
    });

    it('does not attempt to fix non-JSON responses', async () => {
      const htmlText = '<html><body>Hello</body></html>';
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: jest.fn(() => Promise.resolve(htmlText)),
      };
      const config = {...mockConfig, autoFixJson: true};

      const result = await parseResponse(mockResponse, config);

      expect(result).toBe(htmlText);
    });
  });

  describe('Non-JSON response handling', () => {
    it('returns raw text for text/plain content-type', async () => {
      const textContent = 'Plain text response';
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn(() => Promise.resolve(textContent)),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toBe(textContent);
    });

    it('returns raw text for text/html content-type', async () => {
      const htmlContent = '<html><body>Content</body></html>';
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: jest.fn(() => Promise.resolve(htmlContent)),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toBe(htmlContent);
    });

    it('returns text when no content-type header is present', async () => {
      const textContent = 'Response without content-type';
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map(),
        text: jest.fn(() => Promise.resolve(textContent)),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toBe(textContent);
    });
  });

  describe('Error response handling', () => {
    it('throws ApiError with parsed JSON for JSON error responses', async () => {
      const errorData = {message: 'Not Found', errors: {id: 'invalid'}};
      const mockResponse = {
        ok: false,
        status: 404,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify(errorData)),
      };

      try {
        await parseResponse(mockResponse, mockConfig);
        fail('Should have thrown ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(404);
        expect(error.response.data).toEqual(errorData);
        expect(error.message).toContain('404');
      }
    });

    it('throws ApiError with text for HTML error responses', async () => {
      const htmlError = '<html><body>404 Not Found</body></html>';
      const mockResponse = {
        ok: false,
        status: 404,
        headers: new Map([['content-type', 'text/html']]),
        text: jest.fn(() => Promise.resolve(htmlError)),
      };

      try {
        await parseResponse(mockResponse, mockConfig);
        fail('Should have thrown ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.response.data).toBe(htmlError);
      }
    });

    it('handles error responses with malformed JSON gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve('Invalid JSON {'),
      };

      try {
        await parseResponse(mockResponse, mockConfig);
        fail('Should have thrown ApiError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.status).toBe(500);
        // Should keep raw text when JSON parsing fails
        expect(error.response.data).toBe('Invalid JSON {');
      }
    });

    it('handles error when text() fails', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.reject(new Error('Stream error')),
      };

      await expect(parseResponse(mockResponse, mockConfig)).rejects.toThrow('Stream error');
    });
  });

  describe('Edge cases', () => {
    it('handles missing config gracefully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({data: 'test'})),
      };

      const result = await parseResponse(mockResponse, undefined);

      expect(result).toEqual({data: 'test'});
    });

    it('handles response with null headers gracefully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map(),
        text: jest.fn(() => Promise.resolve('plain text')),
      };

      const result = await parseResponse(mockResponse, mockConfig);

      expect(result).toBe('plain text');
    });

    it('includes config in thrown ApiError for debugging', async () => {
      const config = {method: 'POST', url: '/users', body: {name: 'test'}};
      const mockResponse = {
        ok: false,
        status: 400,
        headers: new Map([['content-type', 'application/json']]),
        text: () => Promise.resolve(JSON.stringify({error: 'Bad Request'})),
      };

      try {
        await parseResponse(mockResponse, config);
        fail('Should have thrown ApiError');
      } catch (error) {
        expect(error.config).toBe(config);
        expect(error.config.method).toBe('POST');
      }
    });
  });
});
