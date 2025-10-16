// src/client/internals/responseParser.test.js

import { parseResponse } from './responseParser';
import { ApiError } from '../../core/ApiError';

describe('parseResponse - Processes the raw fetch response', () => {
  const mockConfig = { method: 'GET', url: '/test' };

  it('should parse and return the JSON body for a successful response', async () => {
    const responseData = { id: 1, name: 'Test' };
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve(responseData),
    };

    const result = await parseResponse(mockResponse, mockConfig);
    expect(result).toEqual(responseData);
  });

  it('should throw an ApiError for a non-ok response', async () => {
    const errorData = { message: 'Not Found' };
    const mockResponse = {
      ok: false,
      status: 404,
      json: () => Promise.resolve(errorData),
    };

    // Expect the promise to reject with an instance of ApiError
    await expect(parseResponse(mockResponse, mockConfig)).rejects.toThrow(
      ApiError
    );
  });

  it('should attach the config and response to the thrown ApiError', async () => {
    const errorData = { message: 'Not Found' };
    const mockResponse = {
      ok: false,
      status: 404,
      json: () => Promise.resolve(errorData),
    };

    try {
      await parseResponse(mockResponse, mockConfig);
    } catch (error) {
      expect(error.status).toBe(404);
      expect(error.response).toEqual({
        data: errorData,
        status: 404,
      });
      expect(error.config).toBe(mockConfig);
    }
  });

  it('should return null for a 204 No Content response', async () => {
    const mockResponse = {
      ok: true,
      status: 204,
      json: () => Promise.resolve(null), // A 204 has no body
    };

    const result = await parseResponse(mockResponse, mockConfig);
    expect(result).toBeNull();
  });

  describe('onStatus handlers', () => {
    it('should call the specific onStatus handler for a matching status code', async () => {
      const onStatusHandler = jest.fn(() => 'custom value');
      const configWithHandler = {
        ...mockConfig,
        onStatus: { 422: onStatusHandler },
      };
      const mockResponse = { ok: false, status: 422 };

      const result = await parseResponse(mockResponse, configWithHandler);

      expect(onStatusHandler).toHaveBeenCalledWith(mockResponse);
      expect(result).toBe('custom value');
    });

    it('should NOT throw an ApiError if an onStatus handler is present', async () => {
      const configWithHandler = {
        ...mockConfig,
        onStatus: { 404: () => 'handled' },
      };
      const mockResponse = { ok: false, status: 404 };

      // We expect this promise to resolve, not reject
      await expect(
        parseResponse(mockResponse, configWithHandler)
      ).resolves.toBe('handled');
    });
  });

  describe('autoFixJson feature', () => {
    it('should fix malformed JSON with leading text when autoFixJson is true', async () => {
      // Mock console.warn to ensure it's called
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const malformedText =
        'PHP Warning: Something happened\n\n{"id": 1, "status": "ok"}';
      const expectedJson = { id: 1, status: 'ok' };
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('JSON Parse error')), // Simulate initial parse failure
        text: () => Promise.resolve(malformedText),
      };
      const config = { autoFixJson: true };

      const result = await parseResponse(mockResponse, config);

      expect(result).toEqual(expectedJson);
      expect(warnSpy).toHaveBeenCalledWith(
        'Malformed JSON response was automatically fixed.'
      );

      // Clean up the spy
      warnSpy.mockRestore();
    });

    it('should throw an ApiError if autoFixJson is true but the JSON is still invalid', async () => {
      const malformedText = 'PHP Warning: {"id": 1, "status": "ok"'; // Missing closing brace
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('JSON Parse error')),
        text: () => Promise.resolve(malformedText),
      };
      const config = { autoFixJson: true };

      await expect(parseResponse(mockResponse, config)).rejects.toThrow(
        ApiError
      );
    });

    it('should throw an ApiError for malformed JSON if autoFixJson is false', async () => {
      const malformedText = 'Some text {"id": 1}';
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('JSON Parse error')),
        text: () => Promise.resolve(malformedText),
      };
      const config = { autoFixJson: false }; // Explicitly false

      await expect(parseResponse(mockResponse, config)).rejects.toThrow(
        'Failed to parse JSON response.'
      );
    });
  });
});
