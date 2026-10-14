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
 * Labels are written with textContent, not as markup, so a label holding angle brackets shows them
 * as text rather than as tags. None of ours carries markup.
 *
 * IMPORTANT: initialize is serialized (via .toString()) and run inside the Clay config webview, a
 * separate JS context. It must be self-contained and must NOT reference anything from this module's
 * scope (imports, module-level constants, and so on). Those are undefined in the webview and will
 * throw. Keep such values inline.
 */

/** The Clay row context initialize binds to. It is a ClayItem, so it carries on() as well. */
export interface ThemePreviewContext {
  $element: HTMLElement[];
  $manipulatorTarget?: { get(key: string): unknown };
  config: {
    label?: string;
    description?: string;
    messageKey?: string;
    options?: Array<{ label: string; value: string | number }>;
    previews?: Record<string, string[]>;
  };
  on(event: string, handler: () => void): void;
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

  // the pictures sit centred in framed boxes the way the mosaic faces show a watch: a black backing,
  // a muted border, and pixelated scaling so the low-res watch screen stays crisp when it is blown up.
  // a theme with a day and a night shot gets both, side by side. the dropdown itself takes Clay's own
  // select styles
  style: [
    '.theme-preview .tp-preview { display: flex; justify-content: center; gap: 1.4rem; margin: 0.9rem 0 0.3rem; }',
    '.theme-preview .tp-img { display: block; width: 8rem; max-width: 40%; height: auto; background: #000; border: 2px solid #3d434d; image-rendering: pixelated; }',
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
   */
  initialize: function (this: ThemePreviewContext): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const root = self.$element && self.$element[0];

    if (!root) {
      return;
    }

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

      const pictures = previews[String(select.value)] || [];

      pictures.forEach(function (picture) {
        // only a data url the generator wrote. anything else is skipped rather than drawn broken
        if (typeof picture === 'string' && picture.indexOf('data:image/') === 0) {
          const img = document.createElement('img');

          img.className = 'tp-img';
          img.alt = '';
          img.src = picture;
          gallery.appendChild(img);
        }
      });
    }

    sync();

    // Clay bridges the native select change and its own restore of the saved value to this one event,
    // so this keeps the name and the picture right for a pick and for the page opening on a saved theme
    self.on('change', sync);
  },
};
