/**
 * Specs for the Clay preview's own decisions.
 *
 * Building the page is Clay's work, compiling it is the build's, and loading it is the settings page
 * loader's, which has specs of its own. What the preview decides itself is what it was asked for, and
 * which phone the page's features find. A wrong answer there previews a fresh install when a returning
 * wearer was asked for, or opens the page on plugins and a saved state the page never reads.
 */
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { parseClayPreviewArgs, previewBridge, previewPlugins, hasPluginDefines } from './clay-preview.ts';
import { readPluginPage, renderPluginPage } from '../../tools/pkjs/plugin-page.ts';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installHost } from '../../tools/pkjs/settings-page.ts';
import { createSourceSubscription } from '../../ts/plugin-sources/subscription.ts';

describe('parseClayPreviewArgs', () => {
  /** The flags a face developer types every day have to land where the build reads them. */
  test('reads the face and every flag', () => {
    const result = parseClayPreviewArgs(['my-face', '--watch', '--platform=gabbro', '--settings=saved.json', '--plugins=plugins.json', '--out=page.html']);

    expect(result).toEqual({ face: 'my-face', watch: true, platform: 'gabbro', settings: 'saved.json', plugins: 'plugins.json', out: 'page.html', help: false });
  });

  /** With nothing but the face it previews a fresh install on emery, the watch most faces are built for. */
  test('defaults to a fresh install on emery', () => {
    const result = parseClayPreviewArgs(['my-face']);

    expect(result).toEqual({ face: 'my-face', watch: false, platform: 'emery', settings: null, plugins: null, out: null, help: false });
  });

  /**
   * The mistake this guards. Ignoring a space in place of the equals sign would show a fresh install
   * while the developer believes they are looking at their saved settings.
   */
  test('refuses --settings with a space instead of an equals sign', () => {
    const result = () => parseClayPreviewArgs(['my-face', '--settings', 'saved.json']);

    expect(result).toThrow('unknown argument: --settings');
  });

  /** Ignoring a --plugins with a space would preview a phone with no plugins while the developer expects some. */
  test('refuses --plugins with a space instead of an equals sign', () => {
    const result = () => parseClayPreviewArgs(['my-face', '--plugins', 'plugins.json']);

    expect(result).toThrow('unknown argument: --plugins');
  });

  /** A typo in a flag stops the run rather than previewing something other than what was asked for. */
  test('refuses a flag it does not know', () => {
    const result = () => parseClayPreviewArgs(['my-face', '--plaform=gabbro']);

    expect(result).toThrow('unknown argument: --plaform=gabbro');
  });

  /** An empty value, such as a shell variable that expanded to nothing, is named as missing rather than as a typo. */
  test('refuses a flag with nothing after the equals sign', () => {
    const result = () => parseClayPreviewArgs(['my-face', '--settings=']);

    expect(result).toThrow('--settings needs a value');
  });

  /** A flag where the face belongs would otherwise be read as a face named --watch. */
  test('refuses a run with no face first', () => {
    const result = () => parseClayPreviewArgs(['--watch']);

    expect(result).toThrow('no face given');
  });

  /** paf passes a -- through as typed, so it marks the end of paf's options rather than being a typo. */
  test('skips a bare -- before the flags', () => {
    const result = parseClayPreviewArgs(['my-face', '--', '--watch']);

    expect(result.watch).toBe(true);
  });

  /** Asking for help never builds anything, even beside a flag that would otherwise be refused. */
  test('asks only for the usage when --help is anywhere', () => {
    const result = parseClayPreviewArgs(['my-face', '--nonsense', '--help']);

    expect(result.help).toBe(true);
  });
});

describe('hasPluginDefines', () => {
  /**
   * The opt-in. A face with no plugin define has to preview the page Clay builds from its own config
   * with no feature started, so a feature that reaches for a phone global the preview lacks never
   * stops its preview.
   */
  test('starts no feature for a face without a plugin define', () => {
    const result = hasPluginDefines({ HEALTH_HRV: 1 });

    expect(result).toBe(false);
  });

  /** A define set to 0 is off, as the build reads it, so the face previews as one without it. */
  test('reads a plugin define of 0 as off', () => {
    const result = hasPluginDefines({ PLUGIN_WEATHER: 0 });

    expect(result).toBe(false);
  });

  /** A face built with a plugin define gets the page its features change, which is what the preview is for. */
  test('starts the features for a face with a plugin define on', () => {
    const result = hasPluginDefines({ PLUGIN_WEATHER: 1 });

    expect(result).toBe(true);
  });
});

describe('previewPlugins', () => {
  /** A file with no plugins field is a phone without the plugin calls, which is not the same as an empty list. */
  test('reads a file with no plugins list as a phone without the plugin calls', () => {
    const result = previewPlugins({ state: {} }, 'plugins.json');

    expect(result.plugins).toBeNull();
  });

  /** A misspelt field would otherwise open the page on a phone the developer never asked for. */
  test('refuses a field it does not know', () => {
    const result = () => previewPlugins({ plugin: [] }, 'plugins.json');

    expect(result).toThrow('has a field called plugin');
  });

  /** A state keyed by the category alone would land under a key no plugin source reads. */
  test('refuses a state that is not keyed by category and item', () => {
    const result = () => previewPlugins({ state: { weather: { lastError: 'PERMISSION_DENIED' } } }, 'plugins.json');

    expect(result).toThrow('has a state for weather');
  });
});

describe('installHost', () => {
  const host = globalThis as unknown as Record<string, unknown>;
  let before: Record<'Pebble' | 'localStorage', PropertyDescriptor | undefined>;

  beforeEach(() => {
    before = {
      Pebble: Object.getOwnPropertyDescriptor(host, 'Pebble'),
      localStorage: Object.getOwnPropertyDescriptor(host, 'localStorage'),
    };
  });

  afterEach(() => {
    (['Pebble', 'localStorage'] as const).forEach((name) => {
      const descriptor = before[name];

      if (descriptor) {
        Object.defineProperty(host, name, descriptor);
      } else {
        delete host[name];
      }
    });
  });

  /** A weather subscription as a page hook makes one, never started. */
  function weatherSubscription(): ReturnType<typeof createSourceSubscription> {
    return createSourceSubscription({ category: 'weather', item: 'location', onUpdate: () => {}, onError: () => {} });
  }

  /**
   * The two sides of the --plugins state. The file's state has to land under the key the plugin
   * source reads, or no warning row the page shows from a saved state would ever appear.
   */
  test('puts each saved state where the plugin source reads it', () => {
    const plugins = previewPlugins({ plugins: [], state: { 'weather/location': { pluginUuid: null, lastError: 'PERMISSION_DENIED', lastEmpty: false } } }, 'plugins.json');

    installHost({ platform: 'emery', settings: null }, plugins);

    const result = weatherSubscription().state();

    expect(result.lastError).toBe('PERMISSION_DENIED');
  });

  /** The page hooks read the plugin list through the subscription, so the file's list has to come out there. */
  test('gives the plugin source the plugins the file lists', () => {
    const listed = [{ uuid: 'weather-uuid', name: 'Weather', sources: [] }];

    installHost({ platform: 'emery', settings: null }, previewPlugins({ plugins: listed }, 'plugins.json'));

    const result = weatherSubscription().plugins();

    expect(result).toEqual(listed);
  });

  /** A list call that throws is how the page check stands in for a phone whose plugin list cannot be read, which the page must not take for plugins off. */
  test('gives the plugin source a list call that throws for an unreadable file', () => {
    installHost({ platform: 'emery', settings: null }, previewPlugins({ unreadable: true }, 'plugins.json'));

    const result = weatherSubscription().plugins();

    expect(result).toBeNull();
  });

  /** A phone without the plugin calls has no enumeratePlugins at all, which is how plugins switched off look. */
  test('leaves enumeratePlugins off for a file with no plugins list', () => {
    installHost({ platform: 'emery', settings: null }, previewPlugins({}, 'plugins.json'));

    const result = (host.Pebble as Record<string, unknown>).enumeratePlugins;

    expect(result).toBeUndefined();
  });
});

describe('previewBridge', () => {
  /**
   * A plugin app's page in a desktop browser has no Pebble app behind it, so without the stand-in it
   * would load nothing and refuse to save. With it the page fills from the --settings values, and a
   * Save shows what it would have sent and says on the page that nothing was saved.
   */
  test('fills a plugin app page from the saved values and shows what a save would send', async () => {
    const fixture = path.join(import.meta.dirname, '..', '..', 'tools', 'pkjs', 'fixtures', 'plugin-app');
    const page = renderPluginPage(await readPluginPage(fixture, 'fixture-plugin'), 'fixture-plugin');
    const logged: string[] = [];
    const virtualConsole = new VirtualConsole();

    virtualConsole.on('log', (...parts: unknown[]) => { logged.push(parts.join(' ')); });

    const dom = new JSDOM(page.replace('<head>', '<head>' + previewBridge({ FEED_ON: true, FEED_URL: 'https://example.com/</script>.ics', REFRESH: '5' })), { runScripts: 'dangerously', url: 'https://preview.invalid/', virtualConsole });

    for (let turn = 0; turn < 20; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    (dom.window.document.querySelector('[type="submit"]') as HTMLElement).click();

    for (let turn = 0; turn < 20; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const result = { logged, status: dom.window.document.body.textContent ?? '' };

    expect(result.logged).toContain('clay-preview: a save would have sent {"FEED_ON":true,"FEED_URL":"https://example.com/</script>.ics","REFRESH":"5"}');
    expect(result.status).toContain('this is a preview, so nothing was saved');
    dom.window.close();
  });
});
