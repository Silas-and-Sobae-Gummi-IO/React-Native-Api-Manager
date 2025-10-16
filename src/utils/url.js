/**
 * Converts an object into a URL query string.
 * Supports arrays by repeating the key for each value.
 * Keys with null or undefined values are ignored.
 * @param {object} params The object to serialize.
 * @returns {string} The resulting query string (e.g., "?page=2&sort=asc") or an empty string.
 */
export function serializeParams(params) {
  if (!params) {
    return '';
  }

  // Use flatMap to handle arrays elegantly.
  // If a value is an array, we return an array of key=value strings.
  // If it's not an array, we return a single-element array.
  // flatMap then flattens this into a single array of strings.
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .flatMap(([key, value]) => {
      const encodedKey = encodeURIComponent(key);

      if (Array.isArray(value)) {
        return value.map((item) => `${encodedKey}=${encodeURIComponent(item)}`);
      }

      return [`${encodedKey}=${encodeURIComponent(value)}`];
    });

  if (parts.length === 0) {
    return '';
  }

  return `?${parts.join('&')}`;
}
