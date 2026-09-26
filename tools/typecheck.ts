/**
 * Typechecks every TypeScript project a repo holds, all at once.
 *
 * The projects are the repo's own tsconfig.json (the pkjs runtime) and the framework's builder,
 * tools, and spec configs. Each one is its own tsc run, and none of them waits on another, so they
 * run side by side. Every project runs to the end whether or not another failed, so one broken
 * project never hides the errors in the rest.
 *
 * Run via `npm run typecheck`, in the framework or in a repo mounting it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ENGINE, WORKSPACE, isFamilyRoot } from './paths.ts';
import { listFaces } from './faces.ts';
import { writeIfChanged } from './files.ts';

const requireHost = createRequire(import.meta.url);

/** Every project the check covers, as tsconfig paths. */
export const PROJECTS = [
  path.join(WORKSPACE, 'tsconfig.json'),
  path.join(ENGINE, 'config', 'tsconfig.builder.json'),
  path.join(ENGINE, 'config', 'tsconfig.tools.json'),
  path.join(ENGINE, 'config', 'tsconfig.spec.json'),
];

/** A project written out for one run: its file name and what goes in it. */
export type WrittenProject = { name: string; config: Record<string, unknown> };

/** A path tsc can read in an include list, with forward slashes. */
function slashed(file: string): string {
  return file.split(path.sep).join('/');
}

/**
 * The builder, tools, and spec projects for a family.
 *
 * The framework's own configs reach a face through globs that start one folder above the framework,
 * at that folder's src/. A family's faces are that folder's children, and a glob wide enough to take
 * them in also takes in whatever else sits beside the framework, which on a machine with the framework
 * cloned beside its face repos is those repos. So for a family each face's folders are named one by
 * one, along with the core's.
 *
 * The globs here follow the framework's own configs by hand. One added there and missed here leaves a
 * family's check skipping those files rather than breaking a build, and the configs rarely change, so a
 * second list is cheaper than working these out from the first.
 *
 * @param workspace The family's folder.
 * @param engine The framework's folder inside it.
 * @param faces Each face's folder relative to the family, such as gridlock.
 * @return The three projects, each extending the framework's config of the same name.
 */
export function familyProjects(workspace: string, engine: string, faces: string[]): WrittenProject[] {
  const root = slashed(workspace);
  const lib = slashed(engine);
  const inFaces = (rest: string) => faces.map((face) => `${root}/${face}/${rest}`);

  return [
    {
      name: 'tsconfig.builder.json',
      config: {
        extends: `${lib}/config/tsconfig.builder.json`,
        include: [...inFaces('src/pkjs/clay/builder/**/*.ts'), `${root}/core/pkjs/clay/builder/**/*.ts`, `${lib}/ts/clay/builder/**/*.ts`],
        exclude: [`${root}/node_modules`, `${root}/targets`, `${root}/**/*.spec.ts`, `${root}/**/*.manifest.ts`],
      },
    },
    {
      name: 'tsconfig.tools.json',
      config: {
        extends: `${lib}/config/tsconfig.tools.json`,
        include: [
          `${lib}/tools/**/*.ts`,
          `${lib}/config/**/*.ts`,
          ...inFaces('src/tools/**/*.ts'),
          ...inFaces('src/pkjs/clay/builder/*.manifest.ts'),
          `${root}/core/tools/**/*.ts`,
          `${root}/core/pkjs/clay/builder/*.manifest.ts`,
        ],
        exclude: [`${root}/node_modules`, `${root}/targets`, `${root}/**/*.spec.ts`],
      },
    },
    {
      name: 'tsconfig.spec.json',
      config: {
        extends: `${lib}/config/tsconfig.spec.json`,
        include: [
          `${lib}/**/*.spec.ts`,
          ...inFaces('**/*.spec.ts'),
          `${root}/core/**/*.spec.ts`,
          `${lib}/ts/pkjs/pebble.d.ts`,
          ...inFaces('src/pkjs/generated.d.ts'),
        ],
        exclude: [`${root}/node_modules`, `${lib}/node_modules`, `${root}/targets`, `${lib}/docs`],
      },
    },
  ];
}

/**
 * The projects this run checks. A family gets its builder, tools, and spec projects written under
 * targets/, which the repo's gitignore already covers, and a face uses the list.
 */
function projectsForRun(): string[] {
  if (!isFamilyRoot(WORKSPACE)) {
    return PROJECTS;
  }
  const projects = familyProjects(WORKSPACE, ENGINE, listFaces().map((face) => face.rel));

  // a dot folder, since build-manifests names a sandbox after each target and a target could be typecheck
  const folder = path.join(WORKSPACE, 'targets', '.typecheck');
  fs.mkdirSync(folder, { recursive: true });
  const written = projects.map((project) => {
    const file = path.join(folder, project.name);
    writeIfChanged(file, JSON.stringify(project.config, null, 2) + '\n');
    return file;
  });
  return [PROJECTS[0], ...written];
}

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
  const results = await Promise.all(projectsForRun().map(check));
  const failed = results.filter((result) => !result.ok);

  // silent on a clean run, the same as tsc
  for (const result of failed) {
    console.error(`typecheck failed: ${path.relative(WORKSPACE, result.project).split(path.sep).join('/')}`);
    console.error(result.output.trimEnd());
  }

  if (failed.length) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
