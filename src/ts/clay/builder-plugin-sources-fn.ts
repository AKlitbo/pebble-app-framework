/**
 * Tells a face's Clay builders which Data Sources the wearer has on the Pebble app plugin, so a
 * builder can warn about a weather, stock, or calendar panel the phone has no plugin for.
 *
 * Clay hands a builder component nothing but its own row, so a builder cannot read the source
 * selects itself. A face passes this as its customClay, which Clay runs with the page as `this`. Once
 * the page is built it reads `WEATHER_PROVIDER`, `STOCK_PROVIDER`, and `CALENDAR_SOURCE`, and hands
 * the answer to every row whose element carries a `_pfPluginSources` hook, which the builder piece
 * `ts/shared/plugin-warnings` hangs there. It hands it over again whenever one of the selects
 * changes. A select missing from the page counts as not picked, and a page with no hooked row is left
 * as it is.
 *
 * Clay serializes this and runs it again inside the config webview, so it reaches nothing outside
 * itself: no imports and no module-scope constants. The select keys and the `plugin` value are
 * written out again here, and a spec checks them against the build's plugin kinds table.
 */

/** Which kinds the wearer picked the plugin for, by the kind's name in the providers list. */
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

        picked[kind] = Boolean(select) && String((select as ClayRow).get()) === 'plugin';
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
