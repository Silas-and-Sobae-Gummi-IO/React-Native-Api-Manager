/**
 * A custom error class for consistent, predictable API error handling.
 * It extends the native Error class.
 */
export class ApiError extends Error {
  /**
   * Creates an instance of ApiError.
   * @param {string} message The error message.
   * @param {object} config The request configuration for this request.
   * @param {object} [response] The response object from the server.
   */
  constructor(message, config, response) {
    super(message);
    this.name = 'ApiError';
    this.config = config;
    this.response = response;
    this.status = response?.status; // Optional chaining for safety
  }
}
