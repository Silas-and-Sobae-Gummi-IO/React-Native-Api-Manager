/**
 * A Set of valid HTTP methods for efficient lookup.
 * @private
 */
const validMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

/**
 * Parses a shorthand URL string like "post:users" into an object.
 * Defaults to 'get' if no method is specified.
 * @param {string} shorthand The shorthand URL string.
 * @returns {{method: string, url: string}} The parsed method and URL.
 * @throws {Error} If an invalid method is provided.
 */
export function parseShorthandUrl(shorthand) {
  const parts = shorthand.split(':');

  if (parts.length === 1) {
    return { method: 'get', url: parts[0] };
  }

  const method = parts[0].toLowerCase();
  const url = parts.slice(1).join(':');

  if (!validMethods.has(method)) {
    throw new Error(`Invalid shorthand method: ${parts[0]}`);
  }

  return { method, url };
}

// The parseInterceptorShorthand function remains the same...

/**
 * A map of shorthand symbols to their action names.
 * @private
 */
const actionMap = {
  '+': 'add',
  '-': 'remove',
  '~': 'replace',
};

/**
 * Parses a shorthand interceptor string like "+logger@20" into an object.
 * @param {string} shorthand The shorthand interceptor string.
 * @returns {{action: string, name: string, priority?: number} | null} The parsed interceptor config or null if invalid.
 */
export function parseInterceptorShorthand(shorthand) {
  const match = shorthand.match(/^([+\-~])([^@]+)(?:@(\d+))?$/);

  if (!match) {
    return null;
  }

  const [, symbol, name, priorityStr] = match;
  const action = actionMap[symbol];

  const result = {
    action,
    name,
  };

  if (action === 'add') {
    result.priority = priorityStr ? parseInt(priorityStr, 10) : 10;
  }

  return result;
}
