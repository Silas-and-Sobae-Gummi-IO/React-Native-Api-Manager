// src/client/internals/responseParser.js

import { ApiError } from '../../core/ApiError';

/**
 * Attempts to fix a malformed JSON string by finding the first '{' or '['.
 * @param {string} text The raw text response.
 * @returns {object | null} The parsed JSON object or null if it cannot be fixed.
 * @private
 */
function attemptToFixJson(text) {
  try {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');

    let startIndex = -1;

    if (firstBrace === -1) {
      startIndex = firstBracket;
    } else if (firstBracket === -1) {
      startIndex = firstBrace;
    } else {
      startIndex = Math.min(firstBrace, firstBracket);
    }

    if (startIndex !== -1) {
      const jsonString = text.substring(startIndex);
      return JSON.parse(jsonString);
    }
  } catch (e) {
    // The fix failed, which is okay.
    return null;
  }
  return null;
}

/**
 * @typedef {object} RequestConfig
 * @property {object.<number, function>} [onStatus] - A map of status codes to handler functions.
 * @property {boolean} [autoFixJson] - If true, attempts to fix malformed JSON with leading text.
 * // We will add other config properties here as they become relevant.
 */

/**
 * Parses the raw fetch response, handling successes, errors, and custom status handlers.
 * @param {Response} response The raw response object from fetch.
 * @param {object} config The request configuration for this request.
 * @returns {Promise<any>} A promise that resolves with the parsed data or the result of an onStatus handler.
 * @throws {ApiError} If the response is not ok or cannot be parsed.
 */
export async function parseResponse(response, config) {
  // 1. Check for a custom onStatus handler first.
  if (config.onStatus && config.onStatus[response.status]) {
    return config.onStatus[response.status](response);
  }

  // 2. If the response is not successful, create and throw an ApiError.
  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch (e) {
      // The error response was not JSON, which is fine.
    }
    const errorResponse = { data: errorData, status: response.status };
    throw new ApiError(
      `Request failed with status code ${response.status}`,
      config,
      errorResponse
    );
  }

  // 3. Handle successful empty responses.
  if (response.status === 204) {
    return null;
  }

  // 4. Handle successful responses with a body.
  try {
    return await response.json();
  } catch (jsonError) {
    // The initial JSON parse failed.
    if (config.autoFixJson) {
      const rawText = await response.text();
      const fixedJson = attemptToFixJson(rawText);

      if (fixedJson !== null) {
        console.warn('Malformed JSON response was automatically fixed.');
        return fixedJson;
      }
    }

    // If autoFixJson is false or the fix failed, throw a specific error.
    let rawTextForError;
    try {
      // We try to get the text again in case it wasn't fetched yet.
      rawTextForError = await response.text();
    } catch (textError) {
      rawTextForError = '(Could not read response text)';
    }

    const errorResponse = { data: rawTextForError, status: response.status };
    throw new ApiError('Failed to parse JSON response.', config, errorResponse);
  }
}
