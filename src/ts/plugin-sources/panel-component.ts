/**
 * A Clay panel row, the supported plugins panel at the foot of the settings page.
 *
 * It draws a `<details>` element, so it starts closed and the wearer opens and closes it by tapping
 * its title, with no script involved. Inside sit the intro line, the line saying to turn plugins on
 * when the phone lists none, and a heading for each kind of data with its plugins under it.
 *
 * A store plugin's name links to its store listing only where the settings page has
 * `Pebble.openUrl`. The Pebble app hands a settings page that call while plugins are on, and it asks
 * the wearer before opening the address in the phone's browser. A plain link would instead load the
 * listing inside the settings page itself and lose every unsaved change, so without the call the
 * name stays plain text with the listing's address written under it.
 *
 * A face can restyle it from its own component CSS through these names, which stay as they are:
 *   .component-plugin-panel  the row
 *   .pf-plugins              the details element, drawn as a calm callout
 *   .pf-plugins-title        the summary the wearer taps
 *   .pf-plugins-off          the line saying to turn plugins on, drawn as a warning callout
 *   .pf-plugins-kind         a kind's heading
 *   .pf-plugins-none         the line under a heading with no plugin to list
 *   .pf-plugins-name         a plugin's name, as plain text
 *   .pf-plugins-link         a plugin's name, as a link to its listing
 *   .pf-plugins-tag          the word after a name, such as Installed
 *   .pf-plugins-address      a listing's address, shown where it cannot be a link
 * It takes its colours from the note's --pf-note-accent and --pf-note-info-accent, and its store
 * links and focus ring from --pf-accent, as control-style.ts lists.
 *
 * Every word arrives HTML-escaped, with its dollar signs escaped too, since Clay writes the row into
 * a script block of the settings page as it stands. The panel turns the six escapes back and sets
 * each word as textContent, so a plugin's name shows as written and never becomes markup.
 *
 * It lives with the plugin sources rather than with the other Clay components, so a face built with
 * no plugin define carries none of it. The weather and calendar modes hand it to the app with their
 * page hooks, and the app registers it only for a page holding the panel.
 *
 * IMPORTANT: initialize and the manipulator methods are serialized (via .toString()) and run inside
 * the Clay config webview, a separate JS context. They must be self-contained and must NOT reference
 * anything from this module's scope (imports, module-level constants, and so on). Those are
 * undefined in the webview and will throw. Keep such values inline. The style string is written once
 * here as the module loads, so it can take the shared callout rules.
 */

import { CALLOUT_BADGE, CALLOUT_BOX } from '../clay/callout-style';
import { DISCLOSURE, DISCLOSURE_MARKER, FOCUS_RING, LINK } from '../clay/control-style';
import type { PluginPanelContent } from '../clay/types';

/** The Clay row context initialize and the manipulator bind to. */
export interface PluginPanelContext {
  $element: HTMLElement[];
  config: { panel?: PluginPanelContent };
}

export default {
  /** The component type name, matched by a Clay config item's own `type: 'pluginPanel'`. */
  name: 'pluginPanel',

  /** The markup this component renders for its config row. initialize fills it in. */
  template: '<div class="component component-plugin-panel"><details class="pf-plugins"><summary class="pf-plugins-title"></summary><div class="pf-plugins-body"></div></details></div>',

  // the panel takes the note's calm info look and its off line the warning look, from the shared
  // callout rules. a webview without color-mix keeps the plain tint written first. the title, its
  // arrow, and the links come from the shared control rules
  /** The CSS this component needs, scoped to its own class names. */
  style: [
    '.pf-plugins { ' + CALLOUT_BOX + ' margin: 0; padding-left: 0.6rem; background: rgba(138, 138, 138, 0.12); background: color-mix(in srgb, var(--pf-note-info-accent, #8a8a8a) 12%, transparent); border-left-color: var(--pf-note-info-accent, #8a8a8a); }',
    '.pf-plugins-title { ' + DISCLOSURE + ' font-weight: 700; }',
    '.pf-plugins-title::-webkit-details-marker { display: none; }',
    '.pf-plugins-title:before { ' + DISCLOSURE_MARKER + ' }',
    '.pf-plugins[open] > .pf-plugins-title:before { transform: rotate(45deg); }',
    '.pf-plugins-title:focus-visible { ' + FOCUS_RING + ' }',
    '.pf-plugins-intro { margin: 0.5rem 0 0; }',
    '.pf-plugins-off { ' + CALLOUT_BOX + ' }',
    '.pf-plugins-off:before { ' + CALLOUT_BADGE + ' }',
    '.pf-plugins-kind { margin: 0.7rem 0 0; font-weight: 700; }',
    '.pf-plugins-none { margin: 0.2rem 0 0; opacity: 0.7; }',
    '.pf-plugins-list { margin: 0.2rem 0 0; padding-left: 1.1rem; }',
    '.pf-plugins-entry { margin: 0.2rem 0; }',
    '.pf-plugins-link { ' + LINK + ' }',
    '.pf-plugins-link:focus-visible { ' + FOCUS_RING + ' }',
    '.pf-plugins-tag { margin-left: 0.4rem; opacity: 0.7; font-size: 0.9em; }',
    '.pf-plugins-address { display: block; opacity: 0.7; font-size: 0.9em; word-break: break-all; }',
  ].join(''),

  manipulator: {
    /**
     * Does nothing, since the panel saves no value and draws itself from its row.
     *
     * @return The row, as Clay's own manipulators hand it back.
     */
    set: function (this: PluginPanelContext) {
      return this;
    },

    /**
     * Reads nothing back, since the panel saves no value.
     *
     * @return An empty value.
     */
    get: function (this: PluginPanelContext) {
      return '';
    },
  },

  /**
   * Fills the panel from its row: the title, the lines under it, and each kind with its plugins.
   *
   * A `function` expression, never shorthand method syntax. Clay serializes a registered component
   * by writing `key:` followed by the function's own toString, and a shorthand method stringifies
   * with its name attached, which stops the whole settings page parsing.
   */
  initialize: function (this: PluginPanelContext): void {
    const root = this.$element[0];
    const panel = this.config && this.config.panel;
    const title = root.querySelector('.pf-plugins-title');
    const body = root.querySelector('.pf-plugins-body');

    if (!panel || !title || !body) {
      return;
    }

    // the Pebble app's own call for opening an address outside the settings page, there only while
    // plugins are on
    const host = (window as unknown as { Pebble?: { openUrl?: unknown } }).Pebble;
    const opener = host && typeof host.openUrl === 'function' ? (host as { openUrl: (url: string) => unknown }) : null;
    const store = 'https://apps.repebble.com/';

    // Clay pastes this method into the page with a plain string replace, which can read a dollar sign
    // as the start of a pattern, so the dollar sign is built from its character code
    const dollar = String.fromCharCode(36);

    // &amp; goes last, so an escaped &lt; written as &amp;lt; comes back as the &lt; it was
    const words = function (value: unknown): string {
      const escaped = typeof value === 'string' ? value : '';

      return escaped.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&#36;/g, function () {
        return dollar;
      }).replace(/&amp;/g, '&');
    };

    const add = function (parent: Element, tag: string, className: string, text?: string): HTMLElement {
      const element = document.createElement(tag);

      element.className = className;

      if (text !== undefined) {
        element.textContent = text;
      }

      parent.appendChild(element);
      return element;
    };

    title.textContent = words(panel.title);

    if (words(panel.off)) {
      add(body, 'div', 'pf-plugins-off', words(panel.off));
    }

    add(body, 'p', 'pf-plugins-intro', words(panel.intro));

    (Array.isArray(panel.kinds) ? panel.kinds : []).forEach(function (kind) {
      add(body, 'div', 'pf-plugins-kind', words(kind.label));

      if (words(kind.none)) {
        add(body, 'p', 'pf-plugins-none', words(kind.none));
      }

      const list = add(body, 'ul', 'pf-plugins-list');

      (Array.isArray(kind.entries) ? kind.entries : []).forEach(function (entry) {
        const row = add(list, 'li', 'pf-plugins-entry');
        const listing = words(entry.listing);
        // only an address on the store becomes a link, whatever the row holds
        const onStore = listing.indexOf(store) === 0;

        if (onStore && opener) {
          const link = add(row, 'a', 'pf-plugins-link', words(entry.name)) as HTMLAnchorElement;

          link.href = listing;
          link.addEventListener('click', function (event) {
            event.preventDefault();

            // a refusal or a closed bridge leaves the wearer on the page, which is all a link can do
            try {
              const asked = opener.openUrl(listing) as { then?: (done: unknown, failed: () => void) => unknown } | undefined;

              if (asked && typeof asked.then === 'function') {
                asked.then(null, function () {});
              }
            } catch (error) {
              // nothing to do
            }
          });
        } else {
          add(row, 'span', 'pf-plugins-name', words(entry.name));
        }

        if (words(entry.tag)) {
          add(row, 'span', 'pf-plugins-tag', words(entry.tag));
        }

        if (onStore && !opener) {
          add(row, 'span', 'pf-plugins-address', listing.slice('https://'.length));
        }
      });
    });
  },
};
