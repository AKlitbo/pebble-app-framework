/**
 * Tells a face's Clay builders which Data Sources the wearer has on the Pebble app plugin, so a
 * builder can warn about a weather, stock, or calendar panel the phone has no plugin for.
 *
 * Clay hands a builder component nothing but its own row, so a builder cannot read the source
 * selects itself. The app runs this as part of the page's custom function on every page holding the
 * plugin kinds row, ahead of the face's own customClay, and Clay runs it with the page as `this`. Once
 * the page is built it reads `WEATHER_PROVIDER`, `STOCK_PROVIDER`, and `CALENDAR_SOURCE`, and hands
 * the answer to every row whose element carries a `_pfPluginSources` hook, which the builder piece
 * `ts/shared/plugin-warnings` hangs there. It hands it over again whenever one of the selects
 * changes. A kind with no select on the page counts as picked, since a face whose providers list is
 * the plugin alone gets no select and its panels always read the plugin. A select that drops while
 * the face is on a source of its own takes its kind out of the plugin kinds row, so a kind counted as
 * picked that way warns about nothing. A page with no hooked row is left as it is.
 *
 * Clay serializes this and runs it again inside the config webview, so it reaches nothing outside
 * itself: no imports and no module-scope constants. The select keys and the `plugin` value are
 * written out again here, and a spec checks them against the build's plugin kinds table.
 */

/** Which kinds read from the plugin, picked as the Data Source or the face's only source, by the kind's name in the providers list. */
type PickedKinds = Record<string, boolean>;

/** A row's element, with the hook a builder hangs on it. */
type HookedElement = HTMLElement & { _pfPluginSources?: (picked: PickedKinds) => void };

/** The bits of a Clay row this reaches. */
interface ClayRow {
  $element: ArrayLike<HookedElement | undefined>;
  get(): unknown;
  on(event: string, handler: () => void): void;
}

/** The bits of the Clay config page this reaches. */
interface ClayPage {
  EVENTS: { AFTER_BUILD: string };
  on(event: string, handler: () => void): void;
  getAllItems(): ClayRow[];
  getItemByMessageKey(messageKey: string): ClayRow | undefined;
}

export default function builderPluginSources(this: ClayPage): void {
  this.on(this.EVENTS.AFTER_BUILD, () => {
    const hosts: HookedElement[] = [];

    this.getAllItems().forEach((row) => {
      const element = row.$element ? row.$element[0] : undefined;

      if (element && typeof element._pfPluginSources === 'function') {
        hosts.push(element);
      }
    });

    if (!hosts.length) {
      return;
    }

    // each kind's source select, by the kind's name in the providers list
    const selects: Record<string, string> = { weather: 'WEATHER_PROVIDER', stocks: 'STOCK_PROVIDER', calendar: 'CALENDAR_SOURCE' };
    const kinds = Object.keys(selects);

    const push = (): void => {
      const picked: PickedKinds = {};

      kinds.forEach((kind) => {
        const select = this.getItemByMessageKey(selects[kind]);

        // a kind with no select is plugin only or on the face's own source. the plugin source page
        // leaves the second out of the plugin kinds row, so reading it as picked warns about nothing
        picked[kind] = !select || String(select.get()) === 'plugin';
      });

      // each builder gets its own copy, so one that keeps and changes it cannot change another's
      hosts.forEach((host) => {
        if (typeof host._pfPluginSources === 'function') {
          host._pfPluginSources({ ...picked });
        }
      });
    };

    kinds.forEach((kind) => {
      const select = this.getItemByMessageKey(selects[kind]);

      if (select) {
        select.on('change', push);
      }
    });

    push();
  });
}
