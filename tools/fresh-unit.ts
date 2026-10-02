/**
 * Checks that a unit made from nothing installs everything the framework's tools load.
 *
 * Every unit in the face repos carries a lock from an earlier install, and a lock can hide a package npm
 * would leave out of a new one. So this makes units with no lock in a temp folder and fills each from
 * this checkout with paf use local. One unit lists no plugin and each of the others lists one, since a
 * unit listing them all would let one plugin's packages stand in for another's.
 *
 * In each unit it checks that every package the core and the listed plugin name as a dependency is
 * there, loads every script their paf keys name, and runs paf check and paf typecheck, with paf lint and
 * paf format for a plugin that offers them. Every unit runs to the end, so one broken plugin never hides
 * the next. It builds no face, since that needs the Pebble SDK.
 *
 * It needs this repo's own git checkout, since paf use local reads the clone through git, paf on the
 * PATH, and the network for the installs. It takes the newest version each range allows, so it is a
 * check run by hand and by CI rather than a spec. npm run check:fresh-unit runs it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { namedScripts } from './paf-key.ts';
import { ToolError, reportFailure } from '../src/tools/shared/tool-error.ts';
import { isMainScript } from '../src/tools/shared/entry.ts';

/** The framework repo's root, one folder up from here. */
const ROOT = path.resolve(import.meta.dirname, '..');

/** How long one script gets to load, so a tool that keeps running once imported is named rather than waited on. */
const LOAD_TIMEOUT_MS = 60_000;

/** A path from the unit with forward slashes, for a message. */
function from(unit: string, file: string): string {
  return path.relative(unit, file).split(path.sep).join('/');
}

/** Runs a program in the unit, and gives back what went wrong or null when it passed. */
function run(unit: string, doing: string, command: string, args: string[]): string | null {
  console.log(`== ${doing}`);
  // paf is a .cmd on Windows, which only a shell runs, and a shell splits an argument on its spaces
  const windows = process.platform === 'win32';
  const done = spawnSync(command, windows ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args, { cwd: unit, stdio: 'inherit', shell: windows });

  if (done.error) {
    return `${command} could not be started. ${done.error.message}`;
  }

  return done.status === 0 ? null : `${doing} failed, with ${done.signal ?? `exit code ${done.status}`}`;
}

// loads one script and prints what stopped it on a line of its own. a tool that refuses to be imported,
// since it only runs as a script, has loaded every package its imports name by the time it refuses
// the exit code is set rather than exit called, so the line is written out before the child ends
const LOAD = `
import { pathToFileURL } from 'node:url';
try {
  await import(pathToFileURL(process.argv[1]).href);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes('cannot be imported')) {
    console.log('FAILED ' + message.split('\\n')[0]);
    process.exitCode = 1;
  }
}
`;

/** Why a script could not be loaded from a unit, or null when it loaded. */
function loadProblem(unit: string, file: string): string | null {
  const done = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', LOAD, file], { cwd: unit, encoding: 'utf8', timeout: LOAD_TIMEOUT_MS });

  if (done.status === 0) {
    return null;
  }

  const said = (done.stdout ?? '').split('\n').find((line) => line.startsWith('FAILED '));

  if (said) {
    return said.slice('FAILED '.length);
  }

  // anything that ended the child some other way says why on its error output, when it says at all
  const ended = done.error?.message ?? done.signal ?? `exit code ${done.status}`;
  const wrote = (done.stderr ?? '').trim().split('\n').filter(Boolean).slice(-3).join(' ');

  return `node ended with ${ended}${wrote ? `. ${wrote}` : ''}`;
}

/** Whether a package is installed where a folder inside the unit can reach it, looking no higher than the unit. */
function installed(unit: string, folder: string, name: string): boolean {
  for (let dir = folder; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'node_modules', ...name.split('/'), 'package.json'))) {
      return true;
    }

    if (dir === unit) {
      return false;
    }
  }
}

/**
 * Stops when a folder above the temp folder holds a node_modules. Node looks in every folder above a
 * script for a package, so one there could stand in for a package a unit's install left out, and the
 * check would pass on a broken plugin.
 */
function refuseOutsidePackages(temp: string): void {
  for (let dir = temp; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) {
      throw new ToolError(`${path.join(dir, 'node_modules')} sits above the temp folder the units are made in, so a package there could stand in for one a unit's install left out. Remove it, or point TMPDIR or TEMP at a folder with none above it`);
    }

    if (dir === path.dirname(dir)) {
      return;
    }
  }
}

/** Writes the files of a unit that is one face, listing the plugins given, with Prettier on for code-style. */
function writeUnit(unit: string, plugins: string[]): void {
  const listed = Object.fromEntries(plugins.map((name) => [name, name === 'code-style' ? { prettier: true } : {}]));

  fs.writeFileSync(path.join(unit, 'paf.config.json'), JSON.stringify({ plugins: listed }, null, 2) + '\n');
  fs.writeFileSync(path.join(unit, 'package.json'), JSON.stringify({ name: 'fresh-unit', private: true, workspaces: ['paf', 'paf/plugins/*'] }, null, 2) + '\n');
  fs.writeFileSync(path.join(unit, 'pebble.appinfo.json'), '{ "name": "fresh-unit" }\n');
  fs.writeFileSync(path.join(unit, '.gitignore'), '/paf/\n/paf.paf-*/\n/node_modules/\n/targets/\n');

  // one file each for the typecheck, the lint, and the format, already in the house style
  fs.mkdirSync(path.join(unit, 'src', 'pkjs'), { recursive: true });
  fs.writeFileSync(path.join(unit, 'src', 'pkjs', 'index.ts'), 'export const fresh = true;\n');
  fs.writeFileSync(path.join(unit, 'src', 'style.css'), 'body {\n  color: red;\n}\n');
  fs.writeFileSync(path.join(unit, 'tsconfig.json'), '{\n  "extends": "./paf/tsconfig.json",\n  "include": ["src/pkjs/**/*.ts", "paf/ts/**/*.d.ts"]\n}\n');
}

/** What is wrong with a filled unit: a package left out, a script that does not load, or a paf command that fails. */
function unitProblems(unit: string, plugins: string[]): string[] {
  const framework = path.join(unit, 'paf');
  const problems: string[] = [];

  console.log('== every package named is installed, and every script a paf key names loads');

  for (const dir of [framework, ...plugins.map((name) => path.join(framework, 'plugins', name))]) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));

    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (!installed(unit, dir, name)) {
        problems.push(`${from(unit, dir)}/package.json names ${name}, which the install left out`);
      }
    }

    for (const script of namedScripts(pkg.paf ?? {})) {
      const problem = loadProblem(unit, path.join(dir, script));

      if (problem) {
        problems.push(`${from(unit, path.join(dir, script))} did not load. ${problem}`);
      }
    }
  }

  const offers = (what: 'lint' | 'format') => plugins.some((name) => JSON.parse(fs.readFileSync(path.join(framework, 'plugins', name, 'package.json'), 'utf8')).paf?.[what]);
  const commands = [['check'], ['typecheck'], ...(offers('lint') ? [['lint']] : []), ...(offers('format') ? [['format', '--check']] : [])];

  for (const args of commands) {
    const problem = run(unit, `paf ${args.join(' ')}`, 'paf', args);

    if (problem) {
      problems.push(problem);
    }
  }

  return problems;
}

/** Makes one unit listing the plugins given, fills it, and checks it, then removes it. */
function checkUnit(temp: string, plugins: string[]): string[] {
  const unit = fs.mkdtempSync(path.join(temp, 'paf-fresh-unit-'));

  console.log(`\n##### a unit listing ${plugins.length ? plugins.join(', ') : 'no plugin'}`);

  try {
    writeUnit(unit, plugins);

    // a unit that cannot be made or filled has nothing in it to check
    const setUp = run(unit, 'git init', 'git', ['init', '-q', '.']) ?? run(unit, 'paf use local, which fills paf/ and installs', 'paf', ['use', path.basename(unit), 'local', ROOT]);

    return setUp ? [setUp] : unitProblems(unit, plugins);
  } finally {
    // a file a scanner or a child that just ended still holds must not turn a pass into a failure, or
    // hide the one that was found
    try {
      fs.rmSync(unit, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.error(`${unit} could not be removed. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function main(): void {
  const temp = os.tmpdir();

  refuseOutsidePackages(temp);

  // a plugin is a folder with a package.json, so a folder a branch switch left behind is not taken for one
  const pluginsDir = path.join(ROOT, 'src', 'plugins');
  const plugins = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginsDir, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();

  const failed: string[] = [];

  for (const listed of [[], ...plugins.map((name) => [name])]) {
    const problems = checkUnit(temp, listed);

    if (problems.length > 0) {
      failed.push(`a unit listing ${listed.join(', ') || 'no plugin'}:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    }
  }

  if (failed.length > 0) {
    throw new ToolError(`\na unit made from nothing is not whole.\n${failed.join('\n')}`);
  }

  console.log(`\na unit made from nothing installs and loads what the framework ships, with no plugin and with each of ${plugins.join(', ')}`);
}

if (isMainScript(import.meta)) {
  try {
    main();
  } catch (error) {
    reportFailure(error);
  }
}
