/**
 * Specs for the settings page heading in a face's own build.
 *
 * paf build writes the appinfo's displayName into the phone code, and the page opens under it, so a
 * watchapp and a watchface each get a title that names them. That copy of the app name module stands in
 * for the whole file here, which is why these sit apart from the rest of the builder's specs. Clay shows
 * a heading as markup, so the name has to arrive escaped, while a face's own heading keeps any markup
 * it carries.
 */

import { describe, test, expect, vi } from 'vitest';
import buildConfig from './config-builder';

const written = vi.hoisted(() => ({ name: 'My Face' as string | null }));

vi.mock('../app-name', () => ({
  get appName() {
    return written.name;
  },
}));

describe('buildConfig heading', () => {
  /** A build that knows the app's name titles the page with it, rather than a word that fits no app in particular. */
  test('titles the page with the app name the build wrote', () => {
    written.name = 'My Face';

    const result = buildConfig({})[0];

    expect(result).toEqual({ type: 'heading', defaultValue: 'My Face' });
  });

  /**
   * A name holding a tag would draw as markup, and one holding a dollar sign and a quote reads as a
   * replacement pattern when Clay writes the page, which stops the settings page opening at all.
   */
  test('escapes the app name so it reads as written', () => {
    written.name = 'Tom & <b>Jerry</b> $\'s';

    const result = buildConfig({})[0].defaultValue;

    expect(result).toBe('Tom &amp; &lt;b&gt;Jerry&lt;/b&gt; &#36;&#39;s');
  });

  /** A face's own heading still wins, so one that wants its old title keeps it. */
  test('keeps the face\'s own heading over the app name', () => {
    written.name = 'My Face';

    const result = buildConfig({ heading: 'Watchface Configuration' })[0];

    expect(result).toEqual({ type: 'heading', defaultValue: 'Watchface Configuration' });
  });

  /** A face's own heading went in as written before, so a face that styles its title with markup keeps it. */
  test('keeps the markup in the face\'s own heading', () => {
    written.name = 'My Face';

    const result = buildConfig({ heading: '<em>My</em> Face' })[0].defaultValue;

    expect(result).toBe('<em>My</em> Face');
  });
});
