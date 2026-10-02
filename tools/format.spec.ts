/**
 * Specs for which of the framework's own folders npm run format leaves unwalked.
 *
 * The code-style plugin decides which files are formatted. This repo also holds folders whose files are
 * not this run's to rewrite, and what is worth pinning is that those stay out, since Prettier rewrites
 * whatever it is given and nothing else would notice until a spec read the file or two runs disagreed.
 */
import { describe, expect, test } from 'vitest';
import { leavesHere } from './format.ts';

describe('leavesHere', () => {
  /** A spec reads its fixtures byte for byte, so a reformatted one fails a spec that has nothing wrong with it. */
  test.each(['src/tools/clay-components/fixtures', 'src/tools/shared/fixtures', '.github/shared/fixtures'])('leaves the fixtures in %s', (folder) => {
    const result = leavesHere(folder);

    expect(result).toBe(true);
  });

  /**
   * The docs package formats these with a Prettier of its own version, so a second run over them could ask
   * for output the first refuses, and the lint job could not pass for those files.
   */
  test.each(['docs/site', 'docs/typedoc', 'docs/doxygen'])('leaves %s to the docs package', (folder) => {
    const result = leavesHere(folder);

    expect(result).toBe(true);
  });

  /** A folder the framework owns that was left out would let its files drift from what a unit is held to. */
  test.each(['src/plugins/frame/css', '.github/workflows', 'docs', 'src/tools/shared'])('walks into %s', (folder) => {
    const result = leavesHere(folder);

    expect(result).toBe(false);
  });
});
