/**
 * Running pebble from a tool, and turning a failed run into a message and an exit code.
 *
 * paf build and the dev plugin's tap walk both drive pebble, and a failure has to read and exit the
 * same way from either, whether pebble failed, was killed, ran out of time, or never started.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ToolError, exitCodeOf } from './tool-error.ts';

/** What a pebble run reports back, as far as the tools read it. */
export type PebbleRun = {
  /** The exit code, or null when a signal stopped it. */
  status: number | null;
  /** The signal that stopped it, or null when it exited on its own. */
  signal: NodeJS.Signals | null;
  /** Set when pebble could not run at all, such as when it is not installed, ran past its timeout, or printed past the buffer. */
  error?: NodeJS.ErrnoException;
};

/** Runs pebble with the given arguments in a folder. */
export type PebbleRunner = (args: string[], cwd: string) => PebbleRun;

/**
 * Runs one pebble command in a folder and stops when it fails.
 *
 * A failure ends with pebble's own exit code. A pebble stopped by a signal ends with 128 plus the
 * signal's number, a pebble that ran past its timeout says so, and a pebble that is not installed says
 * the SDK has to be. Any other failure to run gives its own message.
 *
 * @param args The pebble command and its arguments, such as build or emu-tap.
 * @param cwd The folder pebble runs in, such as a build sandbox.
 * @param run What runs pebble, which is the real one outside a spec.
 * @param where What a failure names, the folder's name unless given.
 */
export function runPebble(args: string[], cwd: string, run: PebbleRunner, where: string = path.basename(cwd)): void {
  const result = run(args, cwd);

  // spawnSync reports a run that hit its timeout as an error too, and blaming a missing SDK for it
  // would send the developer looking in the wrong place
  if (result.error?.code === 'ETIMEDOUT') {
    throw new ToolError(`pebble ${args[0]} did not finish in time in ${where}, so it was stopped`);
  }

  // spawnSync says ENOENT for a folder that is not there as well as for a pebble that is not
  if (result.error?.code === 'ENOENT' && !fs.existsSync(cwd)) {
    throw new ToolError(`pebble ${args[0]} could not run in ${where}, since ${cwd} is not there`);
  }

  if (result.error?.code === 'ENOENT') {
    throw new ToolError(`pebble could not run: ${result.error.message}. The Pebble SDK has to be installed, which on Windows means WSL`);
  }

  if (result.error) {
    throw new ToolError(`pebble ${args[0]} could not run in ${where}: ${result.error.message}`);
  }

  // a signal ends the run the way a shell reports it, 128 plus the signal's number, so CI reads
  // an out of memory kill as a kill rather than as an ordinary failure
  if (result.signal) {
    throw new ToolError(`pebble ${args[0]} was stopped by ${result.signal} in ${where}`, exitCodeOf(result));
  }

  if (result.status !== 0) {
    throw new ToolError(`pebble ${args[0]} failed in ${where}`, exitCodeOf(result));
  }
}
