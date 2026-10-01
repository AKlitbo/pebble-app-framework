/**
 * How a tool knows it was started as a script rather than imported by another file or a spec.
 *
 * Every tool does its work only when it is the script Node started, and reads that from
 * import.meta.main. Node has it from 22.18 on the 22 line and from 24.2, so any 23, 24 before 24.2,
 * and 22 before 22.18 leave it undefined. Reading the missing value as false would exit 0 having done
 * nothing, which CI reads as a generator having run or a build having passed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Whether a module's URL is the script Node started, which process.argv[1] names. */
function isStartedScript(url: string): boolean {
  const started = process.argv[1];

  if (!started) {
    return false;
  }

  try {
    return fs.realpathSync(fileURLToPath(url)) === fs.realpathSync(started);
  } catch {
    return false;
  }
}

/**
 * Whether a tool was started as the script itself, which is when it does its work.
 *
 * Under a Node with no import.meta.main it compares the file with the script Node started. An imported
 * file gives false, so importing a tool, as a release step does, never stops the importer. The started
 * script stops the run straight away with exit code 1, naming the Nodes that have import.meta.main. The
 * line is written straight to stderr, since process.exit does not wait for a console write to a Windows
 * terminal, and a write that fails, such as to a closed pipe, still ends in the exit.
 *
 * @param meta The tool's import.meta.
 * @return Whether the tool was started as the script.
 */
export function isMainScript(meta: ImportMeta): boolean {
  const main = (meta as { main?: boolean }).main;

  if (main === undefined) {
    if (!isStartedScript(meta.url)) {
      return false;
    }

    const tool = path.basename(process.argv[1]);

    try {
      fs.writeSync(2, `${tool} needs a Node with import.meta.main, which is 22.18 or newer on Node 22, or 24.2 or newer. This is ${process.versions.node}.\n`);
    } catch {
      // the exit code still says it failed
    }

    process.exit(1);
  }

  return main;
}
