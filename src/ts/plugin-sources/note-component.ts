/**
 * A Clay note row, the callout the plugin source rows on the settings page are drawn in.
 *
 * It draws one note in a tinted box with a coloured left edge, the look of the location picker's own
 * notes. A note has a `tone`. `warning`, the default, carries a round "!" badge and the orange accent,
 * for something the wearer has to fix. `info` drops the badge and takes a calmer grey, for a plain
 * fact such as where the weather comes from. `plain` drops the box altogether and draws the words as
 * Clay draws a select's description, with no separator above, so a select's own words can sit in a row
 * of their own under it and hide while its plugin is picked.
 *
 * A face can restyle it from its own component CSS through these names, which stay as they are:
 *   .component-plugin-note   the row, which a visibleWhen hides and shows
 *   .pf-note                 the callout inside it
 *   .pf-note-warning         a warning callout, whose :before is the badge
 *   .pf-note-info            an info callout
 *   .pf-note-plain           the row of a plain note, whose words sit in Clay's own .description
 *   .pf-note-text            the words
 *   --pf-note-accent         the warning's border, badge, and tint, #ff4700 unless set
 *   --pf-note-info-accent    the info's border and tint, #8a8a8a unless set
 * The custom properties can be set on any element above the note, :root included.
 *
 * The words are the row's defaultValue. Clay writes every row of the page into a script block of the
 * settings page as it stands, so text that reaches the page carries its HTML characters and its
 * dollar signs escaped, which plugin-sources/page.ts does for every note. The note turns the six
 * escapes back and sets the words as textContent, so they show as written and never become markup.
 *
 * It lives with the plugin sources rather than with the other Clay components, so a face built with
 * no plugin define carries none of it. The weather and calendar modes hand it to the app with their
 * page hooks, and the app registers it only for a page holding a note.
 *
 * IMPORTANT: initialize and the manipulator methods are serialized (via .toString()) and run inside
 * the Clay config webview, a separate JS context. They must be self-contained and must NOT reference
 * anything from this module's scope (imports, module-level constants, and so on). Those are
 * undefined in the webview and will throw. Keep such values inline. The style string is written once
 * here as the module loads, so it can take the shared callout rules.
 */

import { CALLOUT_BADGE, CALLOUT_BOX } from '../clay/callout-style';

/** The Clay row context initialize and the manipulator bind to. */
export interface PluginNoteContext {
  $element: HTMLElement[];
  config: { tone?: string };
}

export default {
  /** The component type name, matched by a Clay config item's own `type: 'pluginNote'`. */
  name: 'pluginNote',

  /** The markup this component renders for its config row. initialize adds the tone's class. */
  template: '<div class="component component-plugin-note"><div class="pf-note"><span class="pf-note-text"></span></div></div>',

  // the look is the location picker's .pf-loc-note, from the shared callout rules, which already read
  // --pf-note-accent. the info tone swaps in its own grey, and a webview without color-mix keeps the
  // plain tint written first
  /** The CSS this component needs, scoped to its own class names. */
  style: [
    '.pf-note { ' + CALLOUT_BOX + ' margin: 0; }',
    '.pf-note-warning:before { ' + CALLOUT_BADGE + ' }',
    '.pf-note-info { padding-left: 0.6rem; background: rgba(138, 138, 138, 0.12); background: color-mix(in srgb, var(--pf-note-info-accent, #8a8a8a) 12%, transparent); border-left-color: var(--pf-note-info-accent, #8a8a8a); }',
    // a plain note reads as the description of the select above it, so it takes none of a row's own
    // padding and none of the separator a section draws between rows
    // the section in the selector outweighs Clay's own .section > .component padding whichever sheet
    // loads last, since the Pebble Android app can load the component styles first
    '.section > .component.component-plugin-note.pf-note-plain { padding: 0; margin-top: 0; }',
    '.section > .component.component-plugin-note.pf-note-plain:after { display: none !important; }',
  ].join(''),

  manipulator: {
    /**
     * Shows the note's words.
     *
     * @param value The words with their HTML characters escaped, as the settings page carries them.
     * @return The row, as Clay's own manipulators hand it back.
     */
    set: function (this: PluginNoteContext, value: unknown) {
      const escaped = value === undefined || value === null ? '' : String(value);
      // Clay pastes this method into the page with a plain string replace, which can read a dollar sign
      // as the start of a pattern, so the dollar sign is built from its character code
      const dollar = String.fromCharCode(36);
      // &amp; goes last, so an escaped &lt; written as &amp;lt; comes back as the &lt; it was
      const words = escaped.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&#36;/g, function () {
        return dollar;
      }).replace(/&amp;/g, '&');
      const text = this.$element[0].querySelector('.pf-note-text');

      if (text) {
        text.textContent = words;
      }

      return this;
    },

    /**
     * Reads the note's words back.
     *
     * @return The words as they show.
     */
    get: function (this: PluginNoteContext) {
      const text = this.$element[0].querySelector('.pf-note-text');

      return text ? text.textContent : '';
    },
  },

  /**
   * Gives the callout its tone's class, warning unless the row says info or plain. A plain note swaps
   * the callout for Clay's own description look.
   *
   * A `function` expression, never shorthand method syntax. Clay serializes a registered component
   * by writing `key:` followed by the function's own toString, and a shorthand method stringifies
   * with its name attached, which stops the whole settings page parsing.
   */
  initialize: function (this: PluginNoteContext): void {
    const note = this.$element[0].querySelector('.pf-note');
    const tone = this.config && this.config.tone;

    if (!note) {
      return;
    }

    if (tone === 'plain') {
      this.$element[0].classList.add('pf-note-plain');
      note.className = 'description';
      return;
    }

    note.classList.add(tone === 'info' ? 'pf-note-info' : 'pf-note-warning');
  },
};
