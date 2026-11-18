/**
 * Specs for getting a theme picker's pictures ready for the watch the settings page opens on.
 *
 * The page carries megabytes of base64 when every platform's shots go in, so the cut is what keeps
 * it small. The cut has to keep the very list the picker would have drawn, or a watch shows another
 * platform's shots or none. A previews function has to come off the page before Clay sees it, since
 * Clay rebuilds functions from their text and the require inside would break, and it has to be called
 * on every open, since each open cuts for the watch Clay read when the phone code became ready.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import { pageForWatch, picturesForWatch, settingsPageUrl, takePreviewLoaders, watchPlatform } from './preview-pictures';
import type { ClayConfigItem, ThemePreviewMap } from './types';

// a theme with a day and a night shot per watch, the shape a platform-keyed manifest writes
const BOTH = { emery: ['data:image/png;base64,ED', 'data:image/png;base64,EN'], gabbro: ['data:image/png;base64,GD', 'data:image/png;base64,GN'] };

/** A theme picker row with the given previews. */
function picker(previews: ClayConfigItem['previews'], previewsByKey?: string): ClayConfigItem {
  return { type: 'themePreview', messageKey: 'APPEARANCE_THEME', label: 'Palette', options: [{ label: 'One', value: 0 }], previews, previewsByKey };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('picturesForWatch', () => {
  /** The watch's own shots are the ones the picker draws, so the rest only weigh the page down. */
  test('keeps only the list for the watch the page opens on', () => {
    const result = picturesForWatch(BOTH, 'gabbro');

    expect(result).toEqual({ gabbro: ['data:image/png;base64,GD', 'data:image/png;base64,GN'] });
  });

  /** The picker falls back to the first list a theme carries, so the cut has to keep that one or the row goes blank. */
  test('keeps the first list when the theme has none for this watch', () => {
    const result = picturesForWatch(BOTH, 'chalk');

    expect(result).toEqual({ emery: ['data:image/png;base64,ED', 'data:image/png;base64,EN'] });
  });

  /** An empty list for this watch makes the picker fall back too, so it is not the list to keep. */
  test('keeps the first list when this watch\'s list is empty', () => {
    const result = picturesForWatch({ emery: ['data:image/png;base64,ED'], gabbro: [] }, 'gabbro');

    expect(result).toEqual({ emery: ['data:image/png;base64,ED'] });
  });

  /** A flat list is drawn on every watch, so there is nothing to cut. */
  test('leaves a flat list as it is', () => {
    const result = picturesForWatch(['data:image/png;base64,A'], 'gabbro');

    expect(result).toEqual(['data:image/png;base64,A']);
  });

  /** With no watch known the picker draws the first list, as a plugin app's page does, so that is the one kept. */
  test('keeps the first list when the platform is not known', () => {
    const result = picturesForWatch(BOTH, '');

    expect(result).toEqual({ emery: ['data:image/png;base64,ED', 'data:image/png;base64,EN'] });
  });
});

describe('takePreviewLoaders', () => {
  /** Clay rebuilds a function from its text, which loses the require inside it, so the function has to come off before Clay is built. */
  test('files a previews function under its picker\'s messageKey without calling it', () => {
    const load = vi.fn((): ThemePreviewMap => ({ '0': BOTH }));

    const result = takePreviewLoaders([picker(load)]);

    expect(load).not.toHaveBeenCalled();
    expect(result.loaders).toEqual({ APPEARANCE_THEME: load });
    expect(result.page[0].previews).toEqual({});
  });

  /** A face with plain previews keeps the page it always had, so its start is untouched. */
  test('hands back the same page when no previews is a function', () => {
    const page = [picker({ '0': BOTH })];

    const result = takePreviewLoaders(page);

    expect(result.page).toBe(page);
    expect(result.loaders).toEqual({});
  });

  /** A picker with no messageKey has nothing to file its function under, so it says so rather than quietly opening without pictures. */
  test('warns about a previews function on a picker with no messageKey', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = takePreviewLoaders([{ type: 'themePreview', label: 'Palette', previews: () => ({}) }]);

    expect(result.page[0].previews).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no messageKey'));
  });
});

describe('pageForWatch', () => {
  /** A previews function is how a face keeps the pictures out of every launch, so the open is where it runs. */
  test('calls the picker\'s previews function from the table and cuts what it hands back', () => {
    const load = vi.fn((): ThemePreviewMap => ({ '0': BOTH }));

    const result = pageForWatch([picker({})], 'emery', { APPEARANCE_THEME: load });

    expect(load).toHaveBeenCalledTimes(1);
    expect(result[0].previews).toEqual({ '0': { emery: ['data:image/png;base64,ED', 'data:image/png;base64,EN'] } });
  });

  /** A feature's page hook can add a picker with a function of its own, which still loads as the page opens. */
  test('calls a previews function still sitting on the page', () => {
    const load = vi.fn((): ThemePreviewMap => ({ '0': BOTH }));

    const result = pageForWatch([picker(load)], 'gabbro');

    expect(result[0].previews).toEqual({ '0': { gabbro: ['data:image/png;base64,GD', 'data:image/png;base64,GN'] } });
  });

  /** buildConfig cannot see inside a function, so an option missing its picture is warned about once the map loads. */
  test('warns for an option the loaded map has no picture for', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    pageForWatch([picker({})], 'emery', { APPEARANCE_THEME: () => ({ '1': BOTH }) });

    expect(warn).toHaveBeenCalledWith('the Palette picker has no picture for "One" (value 0)');
  });

  /** Under previewsByKey the themes sit one level down, so the cut has to reach inside every scene's set. */
  test('cuts inside each value of the other control under previewsByKey', () => {
    const page = [picker({ '0': { '0': BOTH }, '1': { '0': BOTH } }, 'APPEARANCE_SCENE')];

    const result = pageForWatch(page, 'gabbro');

    expect(result[0].previews).toEqual({
      '0': { '0': { gabbro: ['data:image/png;base64,GD', 'data:image/png;base64,GN'] } },
      '1': { '0': { gabbro: ['data:image/png;base64,GD', 'data:image/png;base64,GN'] } },
    });
  });

  /** A face passing plain previews keeps working, and its page gets the same cut. */
  test('cuts a plain previews map as well', () => {
    const result = pageForWatch([picker({ '0': BOTH, '1': ['data:image/png;base64,A'] })], 'gabbro');

    expect(result[0].previews).toEqual({ '0': { gabbro: ['data:image/png;base64,GD', 'data:image/png;base64,GN'] }, '1': ['data:image/png;base64,A'] });
  });

  /** buildConfig puts the picker inside the Appearance section, so the walk has to reach into sections. */
  test('reaches a picker inside a section', () => {
    const page: ClayConfigItem[] = [{ type: 'section', items: [{ type: 'heading', defaultValue: 'Appearance' }, picker({ '0': BOTH })] }];

    const result = pageForWatch(page, 'emery');

    expect(result[0].items?.[1].previews).toEqual({ '0': { emery: ['data:image/png;base64,ED', 'data:image/png;base64,EN'] } });
  });

  /** A previews file that throws as it loads costs the picker its pictures, not the whole settings page. */
  test('opens the picker with no pictures when the function throws', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const load = (): ThemePreviewMap => {
      throw new Error('no such module');
    };

    const result = pageForWatch([picker({})], 'emery', { APPEARANCE_THEME: load });

    expect(result[0].previews).toEqual({});
  });

  /** A page with no picker opens exactly as it was, so a face without previews is untouched. */
  test('hands back the same page when it has no picker', () => {
    const page: ClayConfigItem[] = [{ type: 'section', items: [{ type: 'toggle', messageKey: 'A' }] }];

    const result = pageForWatch(page, 'emery');

    expect(result).toBe(page);
  });
});

describe('settingsPageUrl', () => {
  /** A Clay that records the page it was asked to write, with the watch in its meta. */
  function recordingClay(platform: string | null, page: ClayConfigItem[]) {
    const written: unknown[][] = [];
    const clay = {
      config: page as unknown[],
      meta: { activeWatchInfo: platform === null ? null : { platform } },
      generateUrl() {
        written.push(this.config);
        return 'data:';
      },
    };

    return { clay, written };
  }

  /** The picker reads the watch from Clay's meta, so the cut has to read the same field or the two disagree. */
  test('cuts for the watch in Clay\'s meta', () => {
    const { clay, written } = recordingClay('gabbro', [picker({ '0': BOTH })]);

    settingsPageUrl(clay, {});

    expect((written[0] as ClayConfigItem[])[0].previews).toEqual({ '0': { gabbro: ['data:image/png;base64,GD', 'data:image/png;base64,GN'] } });
  });

  /** The next open may come from another watch, so Clay has to keep the uncut page between opens. */
  test('gives Clay its own page back once the URL is written', () => {
    const page = [picker({ '0': BOTH })];
    const { clay } = recordingClay('gabbro', page);

    settingsPageUrl(clay, {});

    expect(clay.config).toBe(page);
  });

  /** Clay fills its meta when the phone says ready, so a page opened without one keeps the list the picker draws with no watch. */
  test('reads no platform from a Clay with no watch in its meta', () => {
    const { clay } = recordingClay(null, []);

    const result = watchPlatform(clay);

    expect(result).toBe('');
  });
});
