/**
 * Merges multiple header objects into a single object.
 * Header keys are normalized to lowercase.
 * Later headers overwrite earlier ones.
 * Headers with null or undefined values are filtered out.
 * @param {...object} sources A sequence of header objects to merge.
 * @returns {object} The final, merged header object.
 */
export function mergeHeaders(...sources) {
  const result = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      if (value !== null && value !== undefined) {
        result[key.toLowerCase()] = value;
      }
    }
  }

  return result;
}
