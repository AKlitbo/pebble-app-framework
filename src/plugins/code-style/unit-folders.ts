/**
 * The folders in a unit that are not the unit's own code, which the lint and the format both leave alone.
 *
 * One list for both, so a stray folder never passes one command and fails the other. paf typecheck walks
 * a unit before the framework is loaded, so paf keeps the same folders in a list of its own.
 */

/** Folders that hold installs, the framework copy, build output, or third-party files, at any depth. */
export const SKIPPED_FOLDERS = ['node_modules', 'paf', 'targets', 'vendor', 'coverage'];

/**
 * Whether a folder is one neither tool walks into, which includes the swap folders beside paf/.
 *
 * A folder whose name starts with a dot is skipped too, since those hold an editor's or a tool's own
 * settings, such as .vscode/ and .git/, and most are gitignored, so reading one would fail a check on
 * one machine that passes on another. .github/ is the one that holds a repo's own files.
 *
 * @param name The folder's own name, with no path.
 * @return True for a folder that is not the unit's own code.
 */
export function skipsFolder(name: string): boolean {
  return SKIPPED_FOLDERS.includes(name) || name.startsWith('paf.paf-') || (name.startsWith('.') && name !== '.github');
}

/**
 * The same folders as ESLint ignore patterns, read from the unit's root. The last one puts .github/ back
 * after the pattern for every dot folder takes it out.
 */
export const SKIPPED_FOLDER_GLOBS = [...SKIPPED_FOLDERS.map((name) => `**/${name}/`), '**/paf.paf-*/', '**/.*/', '!**/.github/'];
