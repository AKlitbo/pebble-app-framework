/**
 * Reading the message keys a face's appinfo declares.
 *
 * The manifest checks, the provider list, and the permissions all ask whether a face declares a key,
 * so they read the names the same way here.
 */

/**
 * The key names a face declares, with any [n] array suffix taken off.
 *
 * @param messageKeys The face's message keys, as its appinfo declares them, a list or a map.
 * @return The names, each once.
 */
export function keyNames(messageKeys: unknown): Set<string> {
  const names = Array.isArray(messageKeys) ? messageKeys : Object.keys(messageKeys ?? {});

  return new Set(names.filter((name) => typeof name === 'string').map((name) => name.split('[')[0]));
}
