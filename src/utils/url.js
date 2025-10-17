/**
 * Convert a plain object into a URL query string.
 * - Arrays are serialized by repeating the key: { ids: [1,2] } => ?ids=1&ids=2
 * - Null/undefined values are omitted
 * - Keys and values are URL-encoded
 *
 * @param {Record<string, any> | undefined | null} params
 * @returns {string}
 */
export function serializeParams(params) {
  if (!params) return '';

  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .flatMap(([key, value]) => buildQueryPairs(key, value));

  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Build key=value pairs for a single entry, handling arrays.
 * @param {string} key
 * @param {any} value
 * @returns {string[]}
 */
function buildQueryPairs(key, value) {
  const encodedKey = encodeURIComponent(key);

  if (Array.isArray(value)) {
    return value.map((item) => `${encodedKey}=${encodeURIComponent(item)}`);
  }
  return [`${encodedKey}=${encodeURIComponent(value)}`];
}
