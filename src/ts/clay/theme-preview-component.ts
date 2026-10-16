/**
 * A Clay theme picker that shows a picture of the chosen theme under the dropdown.
 *
 * It is the ordinary theme dropdown with a preview beneath it. The dropdown is a native select wired
 * to Clay's built-in "val" manipulator, so the chosen value saves under APPEARANCE_THEME exactly the
 * way the plain select does, and a face's customClay can still reach it with
 * getItemByMessageKey('APPEARANCE_THEME').on('change', ...). Picking a theme swaps the picture.
 *
 * A theme carries a list of pictures, as data URLs from the file `paf gen <face> theme-previews`
 * writes, drawn side by side. That is how a face shows a day and a night shot of the same theme. An
 * option with no picture leaves the preview area empty rather than a broken image.
 *
 * A theme's pictures can instead be a map keyed by platform, so a round watch and a rectangular one
 * each get their own shots. Clay hands initialize the config instance, whose meta carries the watch
 * the page was opened from, so the picker draws that platform's list. A face whose manifest left the
 * platform out, or a watch the map does not name, falls back to any list the map does carry rather
 * than an empty row.
 *
 * Labels are written with textContent, not as markup, so a label holding angle brackets shows them
 * as text rather than as tags. None of ours carries markup.
 *
 * IMPORTANT: initialize is serialized (via .toString()) and run inside the Clay config webview, a
 * separate JS context. It must be self-contained and must NOT reference anything from this module's
 * scope (imports, module-level constants, and so on). Those are undefined in the webview and will
 * throw. Keep such values inline. The imports here are type-only, so they erase and never ship.
 */

import type { ThemePreviewPictures } from './types';

/** The Clay row context initialize binds to. It is a ClayItem, so it carries on() as well. */
export interface ThemePreviewContext {
  $element: HTMLElement[];
  $manipulatorTarget?: { get(key: string): unknown };
  config: {
    label?: string;
    description?: string;
    messageKey?: string;
    options?: Array<{ label: string; value: string | number }>;
    previews?: Record<string, ThemePreviewPictures>;
  };
  on(event: string, handler: () => void): void;
}

/** The Clay config instance initialize is handed as its second argument. Its meta carries the watch
 * the page was opened from, which is all the picker reads from it. */
export interface ThemePreviewClay {
  meta?: { activeWatchInfo?: { platform?: string } };
}

export default {
  /** The component type name, matched by a Clay config item's own `type: 'themePreview'`. */
  name: 'themePreview',

  // Clay's own select classes, so the dropdown takes its look. the native select sits invisible over
  // the .value span, which shows the chosen name, and the preview goes under the whole row. initialize
  // fills the label, the options, the description, and the first picture
  template: [
    '<div class="component component-select theme-preview">',
    '  <label class="tap-highlight">',
    '    <span class="label tp-label"></span>',
    '    <span class="value"></span>',
    '    <select class="tp-select" data-manipulator-target></select>',
    '  </label>',
    '  <div class="tp-preview"></div>',
    '  <div class="description tp-desc" style="display:none;"></div>',
    '</div>',
  ].join(''),

  // the pictures sit centred in framed boxes the way the mosaic faces show a watch: a black backing
  // and a muted border. a theme with a day and a night shot gets both, side by side. a round watch's
  // shot is a square framebuffer with the corners outside the circle, so the box is rounded off to the
  // circle the watch really shows. initialize sets image-rendering per shot: crisp pixels when a shot
  // is drawn larger than its own pixels, smooth when a hi-res shot is shrunk to fit. the dropdown
  // itself takes Clay's own select styles
  style: [
    '.theme-preview .tp-preview { display: flex; justify-content: center; gap: 1.4rem; margin: 0.9rem 0 0.3rem; }',
    '.theme-preview .tp-img { display: block; width: 8rem; max-width: 40%; height: auto; background: #000; border: 2px solid #3d434d; }',
    '.theme-preview .tp-img.tp-round { border-radius: 50%; }',
  ].join(''),

  // Clay's built-in value manipulator reads and writes the select's value, so the chosen theme saves
  // under APPEARANCE_THEME the same way the plain select's does
  manipulator: 'val',

  /**
   * Builds the dropdown's options and keeps the preview picture in step with the chosen theme.
   *
   * A `function` expression, never shorthand method syntax. Clay serialises a registered component
   * by writing `key:` followed by the function's own toString, and a shorthand method stringifies
   * with its name attached, which comes out as `initialize:initialize() {` and stops the whole
   * settings page parsing.
   *
   * Clay calls this with the lodash build it bundles and then the config instance. The config
   * instance carries the watch the page was opened from, which is how a platform-keyed theme knows
   * which shots to draw.
   */
  initialize: function (this: ThemePreviewContext, _minified?: unknown, clay?: ThemePreviewClay): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const root = self.$element && self.$element[0];

    if (!root) {
      return;
    }

    // the watch the page was opened from, for a theme that carries a set of shots per platform. empty
    // when Clay hands no meta, which falls back to whatever set the theme does carry
    const watchInfo = clay && clay.meta ? clay.meta.activeWatchInfo : undefined;
    const platform = watchInfo && watchInfo.platform ? watchInfo.platform : '';

    const config = self.config || {};
    const previews = config.previews || {};
    const select = root.querySelector('.tp-select') as HTMLSelectElement;
    const valueSpan = root.querySelector('.value') as HTMLElement;
    const gallery = root.querySelector('.tp-preview') as HTMLElement;

    (root.querySelector('.tp-label') as HTMLElement).textContent = config.label || 'Theme';

    if (config.description) {
      const desc = root.querySelector('.tp-desc') as HTMLElement;

      desc.textContent = config.description;
      desc.style.display = 'block';
    }

    (config.options || []).forEach(function (option) {
      const el = document.createElement('option');

      el.value = String(option.value);
      el.className = 'item-select-option';
      el.textContent = option.label;
      select.appendChild(el);
    });

    /** Mirrors the chosen option's name into Clay's value display, and redraws its pictures. */
    function sync() {
      const chosen = select.options[select.selectedIndex];

      valueSpan.textContent = chosen ? chosen.textContent || '' : '';

      while (gallery.firstChild) {
        gallery.removeChild(gallery.firstChild);
      }

      const entry = previews[String(select.value)];
      let pictures: string[];
      // which platform's shots are actually drawn, so the round mask follows the shot's own shape
      // rather than the watch viewing it. a flat value names no platform, so it stays square the way
      // it did before a map could carry one
      let shotPlatform = '';

      if (Array.isArray(entry)) {
        // one set of shots for every watch
        pictures = entry;
      } else if (entry && typeof entry === 'object') {
        // a set per platform. draw this watch's, and if the theme left this platform out fall back
        // to any set it does carry so the row is never empty when pictures exist
        if (entry[platform] && entry[platform].length) {
          pictures = entry[platform];
          shotPlatform = platform;
        } else {
          const names = Object.keys(entry);

          pictures = names.length ? entry[names[0]] : [];
          shotPlatform = names.length ? names[0] : '';
        }
      } else {
        pictures = [];
      }

      // a platform value that is not a list, which the generator never writes but a hand-built page
      // could, would make the forEach below throw and take the whole settings page down. treat
      // anything but a list as no pictures
      if (!Array.isArray(pictures)) {
        pictures = [];
      }

      // chalk and gabbro are the round watches, so a shot from one is a square framebuffer with the
      // corners outside the circle. mask it to the circle the screen really shows
      const round = shotPlatform === 'chalk' || shotPlatform === 'gabbro';

      pictures.forEach(function (picture) {
        // only a data url the generator wrote. anything else is skipped rather than drawn broken
        if (typeof picture === 'string' && picture.indexOf('data:image/') === 0) {
          const img = document.createElement('img');

          img.className = round ? 'tp-img tp-round' : 'tp-img';
          img.alt = '';

          // a watch shot drawn bigger than its own pixels keeps hard edges, so it stays pixelated. a
          // hi-res shot shrunk to fit the row is smoothed instead, since nearest-neighbour shrinking
          // drops pixels unevenly and leaves the small text looking rough. the box is already on the
          // page, so clientWidth is the real drawn width once the picture has loaded
          img.addEventListener('load', function () {
            img.style.imageRendering = img.clientWidth > img.naturalWidth ? 'pixelated' : 'auto';
          });

          gallery.appendChild(img);
          img.src = picture;
        }
      });
    }

    sync();

    // Clay bridges the native select change and its own restore of the saved value to this one event,
    // so this keeps the name and the picture right for a pick and for the page opening on a saved theme
    self.on('change', sync);
  },
};
