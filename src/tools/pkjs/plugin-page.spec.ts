/**
 * Specs for building a plugin app's settings page.
 *
 * The page cannot keep its settings itself, and Clay's own Save goes to a path a plugin does not
 * have, so the page only works if it loads from the plugin and saves to it. The parts worth pinning are
 * the whole round trip, the built page against the real plugin side through a stand-in bridge, a page
 * that cannot save its defaults over settings it never loaded, and a page staying open with the reason
 * when a save fails, since closing on a failed save loses the wearer's change. The rows the build adds,
 * and what it refuses, are pinned too.
 *
 * The page runs in jsdom. Its close goes to pebblejs://close, which jsdom reports as a navigation it
 * cannot do, so a close is counted from those reports. Nothing waits on the clock. Each step lets the
 * page's promises run out before the spec looks, and the page's five second timeouts are held back
 * until a spec fires them.
 */

import path from 'node:path';
import fs from 'node:fs';
import { describe, test, expect } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { pluginPageItems, readPluginPage, renderPluginPage, SAVE_STATUS_ID } from './plugin-page';
import { handleSettings } from '../../ts/plugin-app/settings';
import type { PluginPebble } from '../../ts/plugin-app/runtime';
import type { ClayConfigItem } from '../../ts/clay/types';
import { tempDir } from '../../ts/testing/temp-dir.ts';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'plugin-app');

/** Lets every promise the page and the plugin have started run out, without waiting on the clock. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** What the stand-in plugin does with secure storage. */
type Keystore = 'works' | 'fails writes' | 'fails reads';

/** The fixture's settings page, open in jsdom against a plugin whose settings live in the maps handed back. */
async function openPage(saved: Record<string, unknown>, secret: Record<string, string>, keystore: Keystore = 'works', ready = true, failure = 'the keystore is locked') {
  const html = renderPluginPage(await readPluginPage(FIXTURE, 'fixture-plugin'), 'fixture-plugin');
  const plain = new Map<string, string>([['paf-plugin-settings', JSON.stringify(saved)]]);
  const secure = new Map(Object.entries(secret));
  let handler: ((message: unknown, respond: (reply: unknown) => void) => void | Promise<void>) | null = null;
  const plugin = {
    registerConfigHandler: (fn: typeof handler) => { handler = fn; },
    refreshSources: () => {},
    secureStorage: {
      getItem: async (key: string) => {
        if (keystore === 'fails reads') {
          throw new Error(failure);
        }

        return secure.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        if (keystore === 'fails writes') {
          throw new Error(failure);
        }

        secure.set(key, value);
      },
      removeItem: async (key: string) => { secure.delete(key); },
    },
  } as unknown as PluginPebble;

  handleSettings({ secret: ['FEED_URL'] }, plugin, { getItem: (key) => plain.get(key) ?? null, setItem: (key, value) => { plain.set(key, value); } });

  const sent: unknown[] = [];
  const closes: string[] = [];
  let readyListener: ((event: { target: string }) => void) | null = null;
  const timeouts: Array<() => void> = [];
  const virtualConsole = new VirtualConsole();

  virtualConsole.on('jsdomError', (error) => {
    if (String(error.message).includes('navigation')) {
      closes.push(error.message);
    }
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://plugin.invalid/config.html',
    virtualConsole,
    beforeParse(window) {
      const later = window.setTimeout.bind(window);

      // the page's five second timeouts wait for a spec to fire them, and Clay's own timers run as usual
      (window as unknown as { setTimeout: unknown }).setTimeout = (callback: () => void, ms?: number) => (ms === 5000 ? timeouts.push(callback) : later(callback, ms));
      (window as unknown as { Pebble: unknown }).Pebble = {
        addEventListener: (name: string, listener: typeof readyListener) => { if (name === 'ready') { readyListener = listener; } },
        sendMessage: (target: string, message: unknown) => {
          sent.push(message);

          return new Promise((resolve) => { void handler?.(message, resolve); });
        },
      };
    },
  });

  const fireReady = async () => {
    readyListener?.({ target: 'plugin' });
    await settle();
  };

  if (ready) {
    await fireReady();
  }

  // swaps the plugin's answers for ones a spec chooses, as a plugin with a handler of its own might give
  const answer = (reply: unknown) => {
    (dom.window as unknown as { Pebble: { sendMessage: unknown } }).Pebble.sendMessage = async () => reply;
  };

  const save = async () => {
    (dom.window.document.querySelector('[type="submit"]') as HTMLElement).click();
    await settle();
  };
  const status = () => dom.window.document.body.textContent ?? '';

  // runs every five second timeout the page has started so far, as if the five seconds had passed
  const timeOut = async () => {
    timeouts.splice(0).forEach((callback) => callback());
    await settle();
  };

  // hands each later message to the spec, which answers it when it chooses
  const hold = () => {
    const held: Array<(reply: unknown) => void> = [];

    (dom.window as unknown as { Pebble: { sendMessage: unknown } }).Pebble.sendMessage = (target: string, message: unknown) => {
      sent.push(message);

      return new Promise((resolve) => { held.push(resolve); });
    };

    return held;
  };

  return { dom, sent, closes, plain, secure, save, status, fireReady, answer, timeOut, hold };
}

describe('the built plugin settings page', () => {
  /**
   * The page opens on what the plugin answers and hands it back on Save. A page that opened on its
   * defaults would save over the wearer's settings, the secret link included, on the next tap of Save.
   */
  test('loads the saved settings from the plugin and saves them back before it closes', async () => {
    const page = await openPage({ FEED_ON: true, REFRESH: '5' }, { FEED_URL: 'https://example.com/work.ics' });

    await page.save();

    expect(page.sent[page.sent.length - 1]).toEqual({ type: 'paf-settings-save', settings: { FEED_ON: true, FEED_URL: 'https://example.com/work.ics', REFRESH: '5' } });
    expect(page.secure.get('FEED_URL')).toBe('https://example.com/work.ics');
    expect(JSON.parse(page.plain.get('paf-plugin-settings') ?? '{}')).toEqual({ FEED_ON: true, REFRESH: '5' });
    expect(page.closes).toHaveLength(1);
    page.dom.window.close();
  });

  /** A Save before the settings load would send the page's defaults, a blank link among them, over the wearer's. */
  test('will not save before the saved settings have loaded', async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' }, 'works', false);

    await page.save();

    expect(page.sent).toEqual([]);
    expect(page.secure.get('FEED_URL')).toBe('https://example.com/work.ics');
    expect(page.status()).toContain('The saved settings have not loaded');
    page.dom.window.close();
  });

  /** A secret the plugin cannot read would load blank and be deleted by the next save, so saving stays off. */
  test('keeps saving off when the plugin cannot read a secret', async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' }, 'fails reads');

    await page.save();

    expect(page.sent.map((message) => (message as { type: string }).type)).toEqual(['paf-settings-load']);
    expect(page.secure.get('FEED_URL')).toBe('https://example.com/work.ics');
    page.dom.window.close();
  });

  /** A plugin answering a save with nothing has not said it kept the settings, so closing would lose the change with nothing said. */
  test('stays open when the plugin answers a save without saying it kept the settings', async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' });

    page.answer({});
    await page.save();

    expect(page.closes).toEqual([]);
    expect(page.status()).toContain('the plugin did not say it kept them');
    page.dom.window.close();
  });

  /** A load answered with no settings would leave the page on its defaults with saving on, and the next save would wipe the link. */
  test('keeps saving off when the plugin answers the load with no settings', async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' }, 'works', false);

    page.answer({ ok: true });
    await page.fireReady();
    await page.save();

    expect(page.status()).toContain('The saved settings have not loaded');
    page.dom.window.close();
  });

  /** A page that closed on a failed save would lose the wearer's change with nothing said. */
  test('stays open and says why when the plugin cannot save', async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' }, 'fails writes');

    await page.save();

    expect(page.status()).toContain('Could not save: Error: the keystore is locked');
    expect(page.closes).toEqual([]);
    page.dom.window.close();
  });

  /** Clay sets the status row's text as HTML, so a reason quoting markup would land on the page as markup rather than read as written. */
  test('shows a reason holding markup as text', async () => {
    const page = await openPage({}, { FEED_URL: 'https://example.com/work.ics' }, 'fails reads', true, '<b>locked</b>');

    const result = page.status();

    expect(result).toContain('<b>locked</b>');
    page.dom.window.close();
  });

  /** A load that failed straight away has its reason on the row, and the five second warning must not cover it. */
  test("keeps the plugin's reason when the load fails before the five seconds", async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' }, 'fails reads');

    await page.timeOut();

    expect(page.status()).toContain('Could not load the saved settings, so saving is off: Error: the keystore is locked');
    expect(page.status()).not.toContain('has not answered');
    page.dom.window.close();
  });

  /** A slow plugin's load still turns Save on, and the warning that saving is off has to go with it. */
  test('takes back the five second warning when the load lands late', async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' }, 'works', false);

    await page.timeOut();
    await page.fireReady();
    await page.save();

    expect(page.status()).not.toContain('saving is off');
    expect(page.closes).toHaveLength(1);
    page.dom.window.close();
  });

  /**
   * After a save times out the wearer can tap Save again. A late reply to the first must not turn Save
   * back on while the second is out, or a third tap sends a third save.
   */
  test('ignores a late reply to a save a newer one replaced', async () => {
    const page = await openPage({ FEED_ON: true }, { FEED_URL: 'https://example.com/work.ics' });
    const held = page.hold();

    await page.save();
    await page.timeOut();
    await page.save();
    held[0]({ error: 'the first save failed' });
    await settle();
    await page.save();

    const saves = page.sent.filter((message) => (message as { type: string }).type === 'paf-settings-save');

    expect([saves.length, page.status().includes('the first save failed')]).toEqual([2, false]);
    page.dom.window.close();
  });

  /** Clay's own Save goes to a return address that closes the page, so the build points it at a hash the page catches instead. */
  test('points Clay\'s own return address at the page itself', async () => {
    const result = renderPluginPage(await readPluginPage(FIXTURE, 'fixture-plugin'), 'fixture-plugin');

    expect([result.includes('window.returnTo="#paf-save:"'), result.includes('pebblejs://close#"')]).toEqual([true, false]);
  });
});

describe('pluginPageItems', () => {
  /** The page's settings code reports a failed save in this row, so a page without it fails with nothing on screen. */
  test('puts the status row above the page\'s own Save button', () => {
    const config: ClayConfigItem[] = [{ type: 'toggle', messageKey: 'A', defaultValue: true }, { type: 'submit', defaultValue: 'Keep' }];

    const result = pluginPageItems(config, 'fixture-plugin').map((item) => item.id ?? item.type);

    expect(result).toEqual(['toggle', SAVE_STATUS_ID, 'submit']);
  });

  /** A Save button inside a section was missed, so the page got a second one and its status row sat apart from the first. */
  test('finds a Save button inside a section', () => {
    const config: ClayConfigItem[] = [{ type: 'section', items: [{ type: 'toggle', messageKey: 'A', defaultValue: true }, { type: 'submit', defaultValue: 'Keep' }] }];

    const result = pluginPageItems(config, 'fixture-plugin');

    expect([result.length, result[0].items?.map((item) => item.id ?? item.type)]).toEqual([1, ['toggle', SAVE_STATUS_ID, 'submit']]);
  });

  /** Without a Save button the page has no way to hand its settings to the plugin. */
  test('adds a Save button to a page that has none', () => {
    const config: ClayConfigItem[] = [{ type: 'toggle', messageKey: 'A', defaultValue: true }];

    const result = pluginPageItems(config, 'fixture-plugin').map((item) => item.id ?? item.type);

    expect(result).toEqual(['toggle', SAVE_STATUS_ID, 'submit']);
  });

  /** A plugin's page opens with no watch behind it, so Clay throws on a row it is asked to check against one. */
  test('refuses a row that names watch capabilities', () => {
    const config = [{ type: 'toggle', messageKey: 'A', capabilities: ['HEALTH'] }] as unknown as ClayConfigItem[];

    const result = () => pluginPageItems(config, 'fixture-plugin');

    expect(result).toThrow(/fixture-plugin's settings page has a row that names watch capabilities/);
  });
});

describe('readPluginPage', () => {
  /** A config split across files imports without extensions, as the framework does, so it has to be bundled rather than loaded file by file. */
  test('reads a config that imports a row from a file beside it', async () => {
    const result = await readPluginPage(FIXTURE, 'fixture-plugin');

    expect(result.clayConfig.map((item) => item.messageKey ?? item.type)).toEqual(['heading', 'FEED_ON', 'FEED_URL', 'REFRESH']);
  });

  /** An arrow customClay sees the wrong this on the page, and a broken one stops the framework's settings code with it. */
  /** A page sharing its defaults with the plugin's script reaches ical.js, which only the build maps, so the page failed to bundle. */
  test('reads a config that shares a file with the plugin script reaching the iCal reader', async () => {
    const result = await readPluginPage(FIXTURE, 'fixture-plugin');

    expect(result.clayConfig.map((row) => row.defaultValue)).toContain('30');
  });

  test('refuses a customClay written as an arrow', async () => {
    const dir = tempDir('paf-plugin-arrow-');

    fs.mkdirSync(path.join(dir, 'src', 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'config', 'index.ts'), 'export const clayConfig = [];\nexport const customClay = () => {};\n');

    const result = readPluginPage(dir, 'arrow-plugin');

    await expect(result).rejects.toThrow(/arrow-plugin's customClay is not written with the function keyword/);
  });

  /** The SDK stops on a config.html the appinfo names and the build never wrote, far from the missing page. */
  test('refuses a plugin app that names config.html with no page of its own', async () => {
    const empty = tempDir('paf-plugin-page-');

    const result = readPluginPage(empty, 'empty-plugin');

    await expect(result).rejects.toThrow('empty-plugin names config.html as its settings page but has no src/config/index.ts');
  });
});
