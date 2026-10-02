/**
 * Stand-ins for what actions/github-script hands an action script, for the specs.
 *
 * Nothing here runs a real tool. Each fake records its calls so a spec can check what the script
 * reported, and answers only what that spec asks it to.
 */
import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { tempDir } from '../../src/ts/testing/temp-dir.ts';

/**
 * Writes files into a fresh temp folder, which is removed once the spec that made it has run.
 *
 * @param files Each file's path from the folder, and its text.
 * @param prefix The start of the folder's name, which says which spec left it if one ever stays.
 * @return The folder.
 */
export function tempTree(files, prefix = 'action-spec-') {
  const root = tempDir(prefix);

  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }

  return root;
}

/**
 * A fake of @actions/core with the parts the scripts use.
 *
 * group runs its body straight away and hands back what the body returns, and summary chains the way
 * the real one does.
 *
 * @return The fake, with every method a Vitest mock.
 */
export function fakeCore() {
  const summary = { addRaw: vi.fn(), write: vi.fn(async () => summary) };

  summary.addRaw.mockReturnValue(summary);
  return {
    setFailed: vi.fn(),
    setOutput: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    group: vi.fn(async (_name, body) => body()),
    summary,
  };
}

/**
 * A fake of @actions/exec that runs nothing.
 *
 * getExecOutput answers from a function of the command, its arguments, and its options. An answer only
 * names what it cares about, and the rest reads as a clean exit with no output.
 *
 * @param answer Picks the result for each call.
 * @return The fake, with getExecOutput a Vitest mock.
 */
export function fakeExec(answer = () => ({})) {
  return {
    getExecOutput: vi.fn(async (command, args, options) => ({
      exitCode: 0,
      stdout: '',
      stderr: '',
      ...answer({ command, args, options }),
    })),
  };
}
