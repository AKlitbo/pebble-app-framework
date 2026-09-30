/**
 * The failures a tool expects, and how a tool's command line reports what stopped it.
 *
 * A tool stops with a ToolError for anything the person running it can fix, such as a mistyped face
 * or a failed pebble step, and only its message is worth printing. Anything else is a bug in the
 * tool, so it prints whole, stack and all, to show where it came from.
 */
import os from 'node:os';

/**
 * The exit code a tool ends with when a program it ran failed, the way a shell reports it.
 *
 * A signal gives 128 plus the signal's number, so CI reads an out of memory kill as a kill rather
 * than as an ordinary failure.
 *
 * @param run What spawnSync reported for the program.
 * @return The exit code to end with.
 */
export function exitCodeOf(run: { status: number | null; signal: NodeJS.Signals | null }): number {
  return run.signal ? 128 + (os.constants.signals[run.signal] ?? 0) : (run.status ?? 1);
}

/** A failure the person running the tool can fix, carrying the exit code the tool ends with. */
export class ToolError extends Error {
  /** The exit code the tool ends with. */
  readonly code: number;

  constructor(message: string, code = 1) {
    super(message);
    this.code = code;
  }
}

/**
 * What to print for whatever a tool threw. A ToolError gives its message, and anything else is a
 * bug in the tool, so it gives its stack to show where.
 *
 * @param error Whatever the tool threw.
 * @return The text to print.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof ToolError) {
    return error.message;
  }
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/**
 * Prints what stopped a tool and sets the exit code it ends with.
 *
 * @param error Whatever the tool threw.
 */
export function reportFailure(error: unknown): void {
  console.error(describeFailure(error));
  process.exitCode = error instanceof ToolError ? error.code : 1;
}
