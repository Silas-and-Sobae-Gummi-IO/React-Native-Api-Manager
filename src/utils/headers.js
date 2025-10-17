/**
 * Merge multiple header objects into a single, normalized object.
 * - Keys are lowercased for case-insensitive behavior
 * - Later sources overwrite earlier ones
 * - Null/undefined values are omitted
 *
 * Example:
 *   mergeHeaders({ Accept: 'json' }, { 'content-type': 'json' })
 *   => { accept: 'json', 'content-type': 'json' }
 *
 * @param {...Record<string, any>} sources
 * @returns {Record<string, any>}
 */
export function mergeHeaders(...sources) {
  const result = {};

  const normalizeKey = (k) => (typeof k === 'string' ? k.toLowerCase() : k);

  for (const source of sources) {
    if (!source) continue;

    for (const [key, value] of Object.entries(source)) {
      if (value === null || value === undefined) continue;
      result[normalizeKey(key)] = value;
    }
  }

  return result;
}
