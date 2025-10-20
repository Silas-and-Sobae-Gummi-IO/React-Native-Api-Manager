// src/client/internals/responseParser.js

import {ApiError} from '../../core/ApiError';

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
 * Check if content-type indicates JSON response
 * @param {string} contentType
 * @returns {boolean}
 * @private
 */
function isJsonContentType(contentType) {
  return /application\/json|application\/.*\+json/.test(contentType);
}

/**
 * Parses the raw fetch response, handling successes and errors.
 * @param {Response|any} response The raw response object from fetch or already-parsed value from onStatus.
 * @param {object} config The request configuration for this request.
 * @returns {Promise<any>} A promise that resolves with the parsed data.
 * @throws {ApiError} If the response is not ok or cannot be parsed.
 */
export async function parseResponse(response, config = {}) {
  // 0. If response is not a Response object (already handled by onStatus), pass through
  if (!response || typeof response.headers?.get !== 'function') {
    return response;
  }

  // 1. Handle successful empty responses early
  if (response.status === 204 || response.headers?.get('content-length') === '0') {
    return null;
  }

  // 2. Get content-type and read response body ONCE
  const contentType = response.headers?.get('content-type') || '';
  const isJson = isJsonContentType(contentType);
  const rawText = await response.text();

  // 3. Parse response content based on content-type
  let parsedContent = rawText;

  if (isJson) {
    try {
      parsedContent = JSON.parse(rawText);
    } catch (e) {
      // JSON parsing failed, try to fix if enabled
      if (config.autoFixJson) {
        const fixed = attemptToFixJson(rawText);
        if (fixed !== null) {
          console.warn('[ApiClient] Malformed JSON response was automatically fixed.');
          parsedContent = fixed;
        } else {
          // Fix failed, keep raw text for error
          parsedContent = rawText;
        }
      } else {
        // autoFixJson disabled, keep raw text for error
        parsedContent = rawText;
      }
    }
  }

  // 4. Handle errors (throw after parsing to include parsed content)
  if (!response.ok) {
    throw new ApiError(`Request failed with status code ${response.status}`, config, {
      data: parsedContent,
      status: response.status,
    });
  }

  // 5. Return parsed content for successful responses
  return parsedContent;
}
