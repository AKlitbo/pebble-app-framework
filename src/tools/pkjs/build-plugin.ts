/**
 * Bundles a plugin app's script into the plugin.js its pbw carries.
 *
 * A plugin app's phone code is TypeScript under src/plugin/, starting at index.ts, and it imports the
 * framework by relative path from paf/ the way a face does. The Pebble app loads a plugin's script as
 * one file, which the SDK copies into the pbw as it is, so esbuild bundles everything the plugin
 * reaches into the sandbox's plugin.js, the framework code and ical.js included.
 *
 * The framework's iCal reader imports ical.js as `./icaljs`, which in a face is a prebuilt file the
 * pkjs build copies in beside it. Here the bundle maps that import to the same prebuilt file. Its
 * MPL licence header opens with a plain comment, which esbuild leaves out of a bundle, so the header is
 * marked as a licence comment as the file is read, and stays at the top of ical.js inside plugin.js.
 *
 * The bundle is an IIFE for ES2017. The plugin runtime runs async functions, which a plugin's source
 * handler is, but has no module loader. It is not minified, so the plugin's own code and ical.js's
 * header read plainly in the pbw. Every module is named in it relative to the workspace, so the same
 * plugin app bundles to the same plugin.js on any machine.
 */

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { icaljsBundle, WORKSPACE } from '../shared/paths.ts';
import { ToolError } from '../shared/tool-error.ts';

/** Where a plugin app's script starts, relative to the plugin app's folder. */
export const PLUGIN_ENTRY = path.join('src', 'plugin', 'index.ts');

/** The opening of ical.js's MPL licence header, which the bundle keeps as a licence comment. */
const MPL_HEADER = '/* This Source Code Form is subject to the terms of the Mozilla Public';

/**
 * Points the `./icaljs` import at the prebuilt ical.js, with its licence header marked so the bundle
 * keeps it. The framework's iCal reader is the only file that imports it.
 *
 * @param file The prebuilt ical.js, or null when ical.js is not installed. A plugin that never reaches
 *   the iCal reader builds without it, and one that does stops with a message saying to install it.
 * @return The esbuild plugin.
 */
export function icaljsPlugin(file: string | null): esbuild.Plugin {
  return {
    name: 'paf-icaljs',
    setup(build) {
      build.onResolve({ filter: /^\.\/icaljs$/ }, () => {
        if (!file || !fs.existsSync(file)) {
          return { errors: [{ text: 'ical.js is missing from node_modules, run npm install' }] };
        }

        // left in the file namespace, so the bundle names it relative to the workspace rather than by
        // the builder's own absolute path. the mark tells the load below it is ical.js
        return { path: path.resolve(file), pluginData: { icaljs: true } };
      });

      build.onLoad({ filter: /\.cjs$/ }, (args) => {
        if (!(args.pluginData as { icaljs?: boolean } | undefined)?.icaljs) {
          return null;
        }

        const text = fs.readFileSync(args.path, 'utf8');

        // the header is how the MPL's notice travels with ical.js, and esbuild drops it unless it is
        // marked, so an ical.js whose header has moved or changed stops the build rather than shipping
        // without it
        if (!text.startsWith(MPL_HEADER)) {
          return { errors: [{ text: `ical.js at ${args.path} does not open with its MPL licence header, so the bundle would drop it. Check the ical.js version the framework asks for` }] };
        }

        return { contents: '/*!' + text.slice(2), loader: 'js' };
      });
    },
  };
}

/**
 * Bundles a plugin app's script into a file.
 *
 * @param pluginDir The plugin app's folder, which holds src/plugin/index.ts.
 * @param outFile Where to write the bundle, normally the sandbox's plugin.js.
 * @param name The plugin app's name, which a refusal names.
 */
export async function bundlePlugin(pluginDir: string, outFile: string, name: string): Promise<void> {
  // esbuild reads relative paths from the workspace and node from where the command ran, so both are
  // made whole first
  const entry = path.resolve(pluginDir, PLUGIN_ENTRY);

  if (!fs.existsSync(entry)) {
    throw new ToolError(`${name} is a plugin app with no ${PLUGIN_ENTRY.split(path.sep).join('/')}, which is where its script starts`);
  }

  let result: esbuild.BuildResult;

  try {
    result = await esbuild.build({
      entryPoints: [entry],
      outfile: path.resolve(outFile),
      // esbuild names each bundled module in a comment relative to this folder, so a run from a
      // subfolder would rewrite every path in the bundle
      absWorkingDir: WORKSPACE,
      bundle: true,
      format: 'iife',
      target: 'es2017',
      minify: false,
      legalComments: 'inline',
      charset: 'utf8',
      logLevel: 'silent',
      plugins: [icaljsPlugin(icaljsBundle())],
    });
  } catch (error) {
    // esbuild's own message names each failure's file and line
    throw new ToolError(`${name}'s plugin script did not bundle. ${error instanceof Error ? error.message : String(error)}`);
  }

  // a warning such as an import that is always undefined builds fine and breaks on the phone, so each
  // one is shown, naming where it is
  for (const warning of result.warnings) {
    console.warn(`warning: ${name}'s plugin script${warning.location ? ` at ${warning.location.file}:${warning.location.line}` : ''}: ${warning.text}`);
  }
}
