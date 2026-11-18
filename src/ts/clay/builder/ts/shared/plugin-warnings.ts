/**
 * A builder's warning about placed panels that read a Pebble app plugin the phone cannot serve right
 * now, so the wearer hears what to turn on before the panel sits empty on the watch.
 *
 * The framework records where each plugin kind stands as the page opens, in the row with the
 * `pf-plugin-kinds` class. A face that reads no plugin has no such row, so this shows nothing there.
 * A now playing or phone battery panel only ever reads a plugin. A weather, stock, or calendar panel
 * only reads one while its Data Source is the Pebble app plugin. The framework's `builderPluginSources`
 * page code reads those selects and hands the answer to every builder that made one of these, through
 * the `_pfPluginSources` hook on the builder's own element.
 *
 * The face says which kind each of its panels reads. Everything else, the wording included, is the
 * same on every face.
 *
 * This is a Clay builder piece. esbuild bundles it into the component's initialize, which runs in the
 * config webview, so it sticks to browser APIs.
 */

import { CALLOUT_BADGE, CALLOUT_BOX } from '../../../callout-style';

/** A kind of data a panel can read from a plugin, by its name in the face's providers list. */
export type PluginKind = 'weather' | 'stocks' | 'calendar' | 'music' | 'phone';

/**
 * Where a kind's plugins stand as the page opens, the `PluginKindState` the plugin page records. It
 * is written out here because page.ts brings the phone code's types with it, and a spec checks the two
 * agree.
 */
export type KindState = 'off' | 'missing' | 'served';

/**
 * The class of the framework's plugin kinds row, `PLUGIN_KINDS_CLASS` in kinds-component.ts. It is
 * written out here because importing that file would carry the whole component into the bundle, and
 * a spec checks the two agree.
 */
export const KINDS_ROW_CLASS = 'pf-plugin-kinds';

/** Which kinds read from the plugin, picked as the Data Source or the face's only source. */
export type PickedKinds = Partial<Record<PluginKind, boolean>>;

/**
 * One warning: the panels it names and why they cannot fill. An `off` warning covers every kind at
 * once, since plugins off in the Pebble app stops them all, so it carries no kind of its own.
 */
export interface PluginWarning {
  state: 'off' | 'missing';
  kind: PluginKind | null;
  panels: string[];
}

/**
 * The kinds a wearer picks a source for, so their panels only read a plugin while it is picked. They
 * are the kinds with a source select in the build's plugin kinds table, and a spec checks the two agree.
 */
export const CHOSEN_KINDS: readonly PluginKind[] = ['weather', 'stocks', 'calendar'];

/**
 * The order missing warnings show in, and what each kind needs, for the warning's words. Every kind
 * is here, and a spec checks it against the providers list's kinds.
 */
export const KIND_NEEDS: ReadonlyArray<readonly [PluginKind, string]> = [
  ['phone', 'the Phone plugin'],
  ['music', 'a music plugin'],
  ['weather', 'a weather plugin'],
  ['stocks', 'a stock plugin'],
  ['calendar', 'a calendar plugin'],
];

/**
 * Works out which placed panels cannot fill, and why.
 *
 * @param panels The names of the panels on the face, in any order, repeats allowed.
 * @param panelKinds The kind each panel reads, by its name. A panel left out reads no plugin.
 * @param states Where each kind's plugins stand. A kind left out reads no plugin on this face.
 * @param picked Which kinds read from the plugin, picked as the Data Source or the face's only source.
 * @return The warnings, plugins off first and then one for each kind with no plugin, each naming its
 *   panels once in the order they were first placed. Empty when every placed panel can fill.
 */
export function pluginWarnings(panels: string[], panelKinds: Partial<Record<string, PluginKind>>, states: Partial<Record<string, KindState>>, picked: PickedKinds): PluginWarning[] {
  const off: string[] = [];
  const missing: Partial<Record<PluginKind, string[]>> = {};

  panels.forEach(function (panel) {
    const kind = panelKinds[panel];

    if (!kind || (CHOSEN_KINDS.indexOf(kind) >= 0 && !picked[kind])) {
      return;
    }

    const state = states[kind];
    let named: string[] | undefined;

    if (state === 'off') {
      named = off;
    } else if (state === 'missing') {
      named = missing[kind] = missing[kind] || [];
    }

    if (named && named.indexOf(panel) < 0) {
      named.push(panel);
    }
  });

  const warnings: PluginWarning[] = [];

  if (off.length) {
    warnings.push({ state: 'off', kind: null, panels: off });
  }

  KIND_NEEDS.forEach(function (entry) {
    const named = missing[entry[0]];

    if (named) {
      warnings.push({ state: 'missing', kind: entry[0], panels: named });
    }
  });

  return warnings;
}

/** The panels' names as a sentence's subject, such as "Stock and Watchlist". */
function nameList(panels: string[]): string {
  if (panels.length < 3) {
    return panels.join(' and ');
  }

  return panels.slice(0, -1).join(', ') + ', and ' + panels[panels.length - 1];
}

/**
 * The words a warning shows.
 *
 * @param warning The warning.
 * @return One sentence saying what to do in the Pebble app.
 */
export function warningText(warning: PluginWarning): string {
  const subject = nameList(warning.panels) + (warning.panels.length > 1 ? ' need ' : ' needs ');

  if (warning.state === 'off') {
    return subject + 'plugins turned on in the Pebble app, under Settings, Plugins.';
  }

  let needs = 'a plugin';

  KIND_NEEDS.forEach(function (entry) {
    if (entry[0] === warning.kind) {
      needs = entry[1];
    }
  });

  return subject + needs + ' in the Pebble app, and your phone has none yet.';
}

/** Reads the framework's plugin kinds row back, as nothing for a page without one or a value that is not an object. */
function readStates(): Partial<Record<string, KindState>> {
  const store = document.querySelector('.' + KINDS_ROW_CLASS) as HTMLInputElement | null;

  if (!store || !store.value) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(store.value);

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Partial<Record<string, KindState>> : {};
  } catch {
    return {};
  }
}

/** A builder's own element, carrying the hook `builderPluginSources` calls with the sources the wearer picked. */
export interface PluginSourcesHost extends HTMLElement {
  _pfPluginSources?: (picked: PickedKinds) => void;
}

/** What a builder hands createPluginWarnings. */
export interface PluginWarningsEnv {
  /** The builder's own element, the row Clay built it in, which the picked sources are handed to. */
  root: PluginSourcesHost;
  /** The element the warnings go straight after, normally the watch and its buttons. */
  after: HTMLElement;
  /** The kind each of the face's panels reads, by the name the builder passes to update. A panel left out reads no plugin. */
  panelKinds: Partial<Record<string, PluginKind>>;
}

/** The warnings on the page, kept in step with the panels on the face and the sources the wearer picked. */
export interface PluginWarningsView {
  /** Redraws the warnings for the panels now on the face, by name. */
  update(panels: string[]): void;
  /** Redraws the warnings for the sources the wearer has picked. `builderPluginSources` calls it through the root's hook. */
  setPicked(picked: PickedKinds): void;
}

/**
 * Puts the warning box on the page, straight after the given element, and returns the handle that
 * keeps it current. The box stays empty and hidden while every placed panel can fill.
 *
 * It also hangs `_pfPluginSources` on the root, so the framework's page code finds the builder and
 * hands it the sources the wearer picked. Until that first lands, no weather, stock, or calendar
 * panel is named, the same as when none of them is picked.
 *
 * @param env The builder's element, where the box goes, and the kind each panel reads.
 * @return The handle to redraw it with.
 */
export function createPluginWarnings(env: PluginWarningsEnv): PluginWarningsView {
  const states = readStates();
  const box = document.createElement('div');
  let panels: string[] = [];
  let picked: PickedKinds = {};

  box.className = 'pf-plugin-warnings';
  // the side gutter is the palette's, so the callouts line up with the palette below
  box.setAttribute('style', 'padding: 0 var(--pf-palette-gutter, 12px);');

  if (env.after.parentNode) {
    env.after.parentNode.insertBefore(box, env.after.nextSibling);
  }

  function draw(): void {
    box.innerHTML = '';

    pluginWarnings(panels, env.panelKinds, states, picked).forEach(function (warning) {
      // the look of the framework's own plugin notes on the same page. the badge is a span here, since
      // an inline style cannot reach a :before, and its content line is ignored on a span
      const note = document.createElement('div');
      const badge = document.createElement('span');
      const words = document.createElement('span');

      note.className = 'pf-plugin-warning';
      note.setAttribute('style', CALLOUT_BOX);
      badge.setAttribute('style', CALLOUT_BADGE);
      badge.textContent = '!';
      words.textContent = warningText(warning);
      note.appendChild(badge);
      note.appendChild(words);
      box.appendChild(note);
    });

    box.hidden = !box.firstChild;
  }

  function setPicked(next: PickedKinds): void {
    picked = next;
    draw();
  }

  env.root._pfPluginSources = setPicked;
  draw();

  return {
    update: function (next) {
      panels = next;
      draw();
    },
    setPicked: setPicked,
  };
}
