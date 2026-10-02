/**
 * Formats the framework's own CSS, JSON, and YAML with Prettier, the way paf format does a unit's.
 *
 * It takes the file rule, the settings, and the run itself from the code-style plugin, so the framework
 * and a unit that turns Prettier on are formatted alike. On top of what the plugin leaves alone, this
 * leaves a spec's fixtures, which are read byte for byte, and the three docs folders the docs package
 * formats with a Prettier of its own, so no file is formatted by two runs.
 *
 * npm run format rewrites the files, and npm run format:check says which would change and writes none.
 */
import path from 'node:path';
import { formatTree, formats } from '../src/plugins/code-style/format.ts';
import { ToolError, reportFailure } from '../src/tools/shared/tool-error.ts';
import { isMainScript } from '../src/tools/shared/entry.ts';

/** The framework repo's root, one folder up from here. */
const ROOT = path.resolve(import.meta.dirname, '..');

// the docs site, the TypeDoc theme, and the Doxygen theme. the docs package formats its own files in
// these with npm --prefix docs run format, and the rest is built output or copied in unchanged
const DOCS_OWN = ['docs/site', 'docs/typedoc', 'docs/doxygen'];

/**
 * Whether the format run leaves a folder unwalked, by its path from the repo root.
 *
 * @param rel The folder's path from the repo root, with forward slashes.
 * @return True for a folder of fixtures, at any depth, and for a folder the docs package formats.
 */
export function leavesHere(rel: string): boolean {
  return rel.split('/').includes('fixtures') || DOCS_OWN.includes(rel);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => arg !== '--check');

  if (unknown !== undefined) {
    throw new ToolError(`unknown argument: ${unknown}. It takes --check`);
  }

  await formatTree(ROOT, { takes: formats, leaves: leavesHere }, args.includes('--check'), 'npm run format');
}

if (isMainScript(import.meta)) {
  main().catch(reportFailure);
}
