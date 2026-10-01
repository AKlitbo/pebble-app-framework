/**
 * Typechecks the framework's own TypeScript projects, all at once.
 *
 * The projects are the pkjs runtime in src/tsconfig.json and the builder, tools, and spec configs. Each
 * one is its own tsc run, and none of them waits on another, so they run side by side. Every project
 * runs to the end whether or not another failed, so one broken project never hides the errors in the
 * rest.
 *
 * A face checks its own projects with tsc, so this only ever runs in the framework repo, as
 * `npm run typecheck`.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { isMainScript } from '../src/tools/shared/entry.ts';

const requireHost = createRequire(import.meta.url);

/** The framework repo's root, one folder up from here. */
export const ROOT = path.resolve(import.meta.dirname, '..');

/** Every project the check covers, as tsconfig paths. */
export const PROJECTS = [
  path.join(ROOT, 'src', 'tsconfig.json'),
  path.join(ROOT, 'tsconfig.builder.json'),
  path.join(ROOT, 'tsconfig.tools.json'),
  path.join(ROOT, 'tsconfig.spec.json'),
];

/** One project's run: whether it passed and what tsc printed. */
type Result = { project: string; ok: boolean; output: string };

/**
 * Runs tsc on one project and collects what it prints.
 *
 * tsc's own entry runs under this node rather than the node_modules/.bin shim, which on Windows is a
 * .cmd that would need a shell.
 */
function check(project: string): Promise<Result> {
  return new Promise((resolve) => {
    // tsc only colours its output on a terminal, and through a pipe it sees none, so it is told
    // whether this run's own output is one
    const pretty = process.stderr.isTTY ? 'true' : 'false';
    const child = spawn(process.execPath, [requireHost.resolve('typescript/bin/tsc'), '-p', project, '--pretty', pretty]);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ project, ok: false, output: String(error) }));
    child.on('close', (code) => resolve({ project, ok: code === 0, output }));
  });
}

async function main(): Promise<void> {
  const results = await Promise.all(PROJECTS.map(check));
  const failed = results.filter((result) => !result.ok);

  // silent on a clean run, the same as tsc
  for (const result of failed) {
    console.error(`typecheck failed: ${path.relative(ROOT, result.project).split(path.sep).join('/')}`);
    console.error(result.output.trimEnd());
  }

  if (failed.length) {
    process.exit(1);
  }
}

if (isMainScript(import.meta)) {
  main();
}
