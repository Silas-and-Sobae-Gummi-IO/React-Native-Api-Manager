/**
 * Valid HTTP methods supported by shorthand syntax.
 * @private
 */
const METHOD_SET = new Set(['get', 'post', 'put', 'patch', 'delete']);

/**
 * Parse a shorthand URL string, e.g. "post:users" => { method: 'post', url: 'users' }.
 * If no method prefix is present, defaults to GET.
 *
 * @param {string} shorthand
 * @returns {{ method: string, url: string }}
 */
export function parseShorthandUrl(shorthand) {
  const parts = String(shorthand).split(':');

  if (parts.length === 1) return { method: 'get', url: parts[0] };

  const method = parts[0].toLowerCase();
  const url = parts.slice(1).join(':'); // preserve any additional colons in URL

  if (!METHOD_SET.has(method)) {
    throw new Error(`Invalid shorthand method: ${parts[0]}`);
  }

  return { method, url };
}

/**
 * Map of shorthand symbols to actions.
 * @private
 */
const ACTION_MAP = { '+': 'add', '-': 'remove', '~': 'replace' };

/**
 * Parse interceptor shorthand commands like "+logger@20" or "-logger".
 *
 * @param {string} shorthand
 * @returns {{ action: 'add'|'remove'|'replace', name: string, priority?: number } | null}
 */
export function parseInterceptorShorthand(shorthand) {
  const match = String(shorthand).match(/^([+\-~])([^@]+)(?:@(\d+))?$/);
  if (!match) return null;

  const [, symbol, name, priorityStr] = match;
  const action = ACTION_MAP[symbol];

  if (action === 'add') {
    return {
      action,
      name,
      priority: priorityStr ? parseInt(priorityStr, 10) : 10,
    };
  }

  return { action, name };
}
