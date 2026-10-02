/**
 * Lints a unit's own TypeScript with the house style.
 *
 * A unit is linted with eslint.config.ts beside this file. One that adds rules of its own keeps a config
 * of its own, which is used whole in its place, so it has to spread the default export from here and add
 * to it. That config sits in config/ with the unit's other tool configs, or at the unit's root, which is
 * the one place an editor's ESLint looks. The config used is printed, so a copy left by mistake shows up.
 *
 * It runs ESLint through its API with the config loaded here, so ESLint looks up no config file of its
 * own and reads every pattern from the unit's root.
 *
 * paf lint runs this from the unit when it lists the code-style plugin, and --fix writes what ESLint can
 * fix itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { requireMounted } from '../../tools/shared/faces.ts';
import { WORKSPACE } from '../../tools/shared/paths.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

/**
 * Where a unit keeps a config of its own, from the unit's root, in the order they are looked for. The
 * house style lints .ts and no .mts or .cts, so a config under one of those names is not taken.
 */
const UNIT_CONFIGS = ['config/eslint.config.ts', 'eslint.config.ts', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'];

/**
 * The config a unit is linted with: its own when it keeps one, and the house style's otherwise.
 *
 * One in config/ wins over one at the unit's root, since a root file is usually only there to hand an
 * editor the same config.
 *
 * @param unit The unit's folder.
 * @return The config file's path.
 */
export function configFile(unit: string): string {
  const own = UNIT_CONFIGS.map((name) => path.join(unit, ...name.split('/'))).find((file) => fs.existsSync(file));
  return own ?? path.join(import.meta.dirname, 'eslint.config.ts');
}

/**
 * A config file's default export as the list ESLint takes, refused when the file exports none.
 *
 * ESLint handed nothing falls back to its own defaults, which lint no TypeScript, so a unit's config with
 * no default export would pass every time with nothing checked.
 *
 * @param config The file's default export, already waited for when the file exports a promise.
 * @param file The config file, as a message names it.
 * @return The config, with a single block put in a list of its own.
 */
export function configFrom(config: unknown, file: string): Linter.Config[] {
  const blocks = Array.isArray(config) ? config : [config];

  if (blocks.length === 0 || !blocks.every((block) => typeof block === 'object' && block !== null)) {
    throw new ToolError(`${file} has no config as its default export, so nothing would be linted. Export a list that spreads the default export of paf/plugins/code-style/eslint.config.ts, with the unit's own rules after it`);
  }
  return blocks;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => arg !== '--fix');
  if (unknown !== undefined) {
    throw new ToolError(`unknown argument: ${unknown}. paf lint takes --fix`);
  }
  requireMounted();

  const fix = args.includes('--fix');
  const file = configFile(WORKSPACE);
  const named = path.relative(WORKSPACE, file).split(path.sep).join('/');

  // a config that throws as it loads keeps its own error, stack and all, since that is what says where
  // in the file it went wrong. the line before it says which config was being loaded
  // a config file may export a promise, which ESLint waits for when it loads one itself
  let exported: unknown;
  try {
    exported = await (await import(pathToFileURL(file).href)).default;
  } catch (error) {
    console.error(`${named} could not be loaded`);
    throw error;
  }

  // a unit with no file the config covers has nothing to lint, which passes rather than stopping on
  // ESLint's own error for a pattern that matched nothing
  const eslint = new ESLint({ cwd: WORKSPACE, overrideConfigFile: true, overrideConfig: configFrom(exported, named), fix, errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles(['.']);
  if (results.length === 0) {
    console.log(`nothing to lint, since the unit holds no file ${named} covers`);
    return;
  }
  if (fix) {
    await ESLint.outputFixes(results);
  }

  const formatter = await eslint.loadFormatter('stylish');
  const report = await formatter.format(results);
  if (report) {
    console.log(report);
  }
  console.log(`linted with ${named}`);

  if (results.some((result) => result.errorCount > 0)) {
    process.exitCode = 1;
  }
}

if (isMainScript(import.meta)) {
  main().catch(reportFailure);
}
