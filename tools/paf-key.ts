/**
 * The scripts a paf key names, for the checks in this repo that follow them.
 *
 * paf reads the keys itself. This is only the shape as far as the files go, shared by the spec that
 * checks every named file is there and the check that loads each one in a unit made from nothing, so a
 * new kind of entry is added once.
 */

/** The paf key of a package, as far as the scripts it names go. */
export type PafKey = {
  build?: { script: string };
  lint?: { script: string };
  format?: { script: string };
  gen?: Record<string, { script: string }>;
  check?: string[];
  tools?: Record<string, { script: string }>;
};

/**
 * Every script a paf key names, relative to its package's folder.
 *
 * @param key The paf key.
 * @return The scripts, in the order the key lists them.
 */
export function namedScripts(key: PafKey): string[] {
  return [
    ...[key.build, key.lint, key.format].flatMap((entry) => (entry ? [entry.script] : [])),
    ...Object.values(key.gen ?? {}).map((entry) => entry.script),
    ...(key.check ?? []),
    ...Object.values(key.tools ?? {}).map((entry) => entry.script),
  ];
}
