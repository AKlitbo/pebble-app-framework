/**
 * Formats a unit's CSS, JSON, and YAML with Prettier, for a unit that turns it on.
 *
 * It is off until the unit sets "plugins": { "code-style": { "prettier": true } } in its
 * paf.config.json, so listing the plugin for its lint never rewrites a file. With it off this prints one
 * line and passes, so a repo's CI can run it over every unit.
 *
 * ESLint keeps the TypeScript. HTML is left alone, since a frame page is baked into pixels and the Clay
 * generator flattens its templates line by line, so a re-wrap would change what either one writes.
 *
 * A file a tool writes is left to that tool. The icons generator writes each media entry of a
 * pebble.appinfo.json on one line, which Prettier would wrap, so formatting it would leave paf check
 * and paf format disagreeing for good.
 *
 * paf format runs this from the unit when it lists the code-style plugin, and --check reports the files
 * that would change without writing them.
 */
import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { requireMounted } from '../../tools/shared/faces.ts';
import { WORKSPACE } from '../../tools/shared/paths.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';
import { skipsFolder } from './unit-folders.ts';

/** The part of a unit's paf.config.json that turns Prettier on. */
export type CodeStyleConfig = { plugins?: { 'code-style'?: { prettier?: boolean } } };

/**
 * Whether a unit's paf.config.json turns Prettier on.
 *
 * @param config The unit's paf.config.json.
 * @return True only when the code-style plugin's prettier setting is true.
 */
export function prettierIsOn(config: CodeStyleConfig): boolean {
  return config.plugins?.['code-style']?.prettier === true;
}

// files a tool writes in a layout of its own: the icons generator, npm, and paf
const TOOL_FILES = new Set(['pebble.appinfo.json', 'package.json', 'package-lock.json', 'paf.config.json']);

/**
 * Whether Prettier formats a file, by its path from the unit's root.
 *
 * @param rel The file's path from the unit, with forward slashes.
 * @return True for a CSS, JSON, or YAML file that no tool writes and no skipped folder holds.
 */
export function formats(rel: string): boolean {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];

  if (parts.slice(0, -1).some(skipsFolder)) {
    return false;
  }

  // anything with .g. in its name is generated, and resources/icons.json is a table kept in columns by hand
  if (name.includes('.g.') || TOOL_FILES.has(name) || rel.endsWith('resources/icons.json')) {
    return false;
  }

  return /\.(css|json|ya?ml)$/.test(name);
}

/** What decides which files a format run takes: the rule for a file, and one for a folder it never walks into. */
export type FormatRules = {
  /** Whether a file is formatted, by its path from the root with forward slashes. */
  takes: (rel: string) => boolean;
  /** Whether a folder is left unwalked, by its path from the root, on top of the folders no run walks. */
  leaves?: (rel: string) => boolean;
};

/** Every file under a folder that the rules take, as paths from the root with forward slashes, in order. */
function filesUnder(root: string, rules: FormatRules, folder = ''): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const rel = folder ? `${folder}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (!skipsFolder(entry.name) && !rules.leaves?.(rel)) {
        found.push(...filesUnder(root, rules, rel));
      }
    } else if (entry.isFile() && rules.takes(rel)) {
      found.push(rel);
    }
  }

  return found.sort();
}

/**
 * Formats every file under a root that the rules take, with the settings beside this file, or with check
 * only says which would change.
 *
 * A file Prettier cannot parse is named and the rest still run, and it fails the run at the end. A run
 * that writes says how many files it rewrote whether or not another stopped it.
 *
 * @param root The folder to format, a unit or the framework's own repo.
 * @param rules Which files it takes and which folders it leaves.
 * @param check True to write nothing and fail when a file would change.
 * @param rewrite The command that rewrites the files, which a failed check names.
 */
export async function formatTree(root: string, rules: FormatRules, check: boolean, rewrite: string): Promise<void> {
  const options = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'prettier.config.json'), 'utf8'));
  const files = filesUnder(root, rules);
  const changed: string[] = [];
  const unread: string[] = [];

  for (const rel of files) {
    const file = path.join(root, rel);
    const source = fs.readFileSync(file, 'utf8');
    let formatted: string;

    // Prettier's error for a file it cannot parse names no file, so the path goes in front of its first
    // line, which carries the line and column. anything else it throws is not about the file, so it is
    // left to stop the run with its own stack
    try {
      formatted = await prettier.format(source, { ...options, filepath: file });
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }

      unread.push(`${rel}: ${error.message.split('\n')[0]}`);
      continue;
    }

    if (formatted !== source) {
      changed.push(rel);

      if (!check) {
        fs.writeFileSync(file, formatted);
      }
    }
  }

  const problems: string[] = [];

  if (unread.length > 0) {
    problems.push(`Prettier could not read ${unread.length} of ${files.length} files:\n${unread.join('\n')}`);
  }

  if (check && changed.length > 0) {
    problems.push(`${changed.length} of ${files.length} files are not formatted. Run ${rewrite} to rewrite them:\n${changed.join('\n')}`);
  }

  // what a run without --check rewrote is said whether or not another file stopped it
  if (!check) {
    console.log(`formatted ${changed.length} of ${files.length} files`);
  }

  if (problems.length > 0) {
    throw new ToolError(problems.join('\n\n'));
  }

  if (check) {
    console.log(`all ${files.length} files are formatted`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => arg !== '--check');

  if (unknown !== undefined) {
    throw new ToolError(`unknown argument: ${unknown}. paf format takes --check`);
  }

  requireMounted();

  const configFile = path.join(WORKSPACE, 'paf.config.json');
  const config: CodeStyleConfig = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};

  if (!prettierIsOn(config)) {
    console.log('Prettier is off for this unit. Turn it on with "plugins": { "code-style": { "prettier": true } } in paf.config.json');
    return;
  }

  await formatTree(WORKSPACE, { takes: formats }, args.includes('--check'), 'paf format');
}

if (isMainScript(import.meta)) {
  main().catch(reportFailure);
}
