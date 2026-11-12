/**
 * Keeps an API key per provider on the settings page, so switching the Data Source swaps the key.
 *
 * A face's page has one API key row per kind, such as `STOCK_API_KEY` under `STOCK_PROVIDER`. The
 * phone writes the key it holds for each provider onto that row as `providerKeys` each time the page
 * opens, with a spare key that belongs to no provider yet. When the wearer changes the select, this
 * keeps what the row held as the old provider's key and puts the new provider's key in the row. A
 * provider that needs a key and has none takes the spare, or a blank row. The row keeps its own message
 * key, so the save still carries the key of the provider picked, and the features read it as before.
 *
 * A key is never filed under a provider the row hides for, read off the row's own visibleWhen on the
 * select as the page's show and hide reads it, such as Yahoo or Open-Meteo, nor under the plugin
 * choice or a blank select. A key on the row there becomes the spare instead. A blank select shows the
 * spare on the row, so a save that touches nothing keeps it. The phone files a saved row by the same
 * rules, in provider-keys.ts.
 *
 * The keys for the other providers go back with the save in a hidden store the phone adds on the
 * same `PF_PROVIDER_KEYS` message key, which this keeps up to date on every change. Clay only saves
 * the rows that carry a message key, and it seals its own methods, so a hidden store is the one way to
 * send more. The face never declares that key, so the phone takes it out of the save before Clay
 * would send it to the watch under a key it cannot map.
 *
 * The keys travel as URI encoded JSON in both directions. Clay pastes the page into a script block
 * with a plain string replace, so a key holding a dollar sign or a `<` could otherwise break the page.
 *
 * Clay serialises this and runs it inside the config webview, so it reaches nothing outside itself:
 * no imports and no module-scope constants. The store's key is written out again in provider-keys.ts,
 * and a spec checks the two agree.
 */

/** One `visibleWhen` test on a row, as the page holds it. */
interface Condition {
  key?: unknown;
  in?: unknown[];
  notIn?: unknown[];
}

/** The bits of a Clay row this reaches. */
interface ClayRow {
  config: { providerKeys?: { select?: unknown; keys?: unknown }; visibleWhen?: Condition | Condition[] };
  get(): unknown;
  set(value: unknown): void;
  on(event: string, handler: () => void): void;
}

/** The bits of the Clay config page this reaches. */
interface ClayPage {
  EVENTS: { AFTER_BUILD: string };
  on(event: string, handler: () => void): void;
  getAllItems(): ClayRow[];
  getItemByMessageKey(messageKey: string): ClayRow | undefined;
}

/** One key row and its select, with the keys held for each of the select's providers and the spare. */
interface KeyedRow {
  select: string;
  row: ClayRow;
  picker: ClayRow;
  keys: Record<string, string>;
  spare: string;
  /** The provider the saved row belongs to, as its select holds it, which a blank select shows the key of. */
  owner: string;
  takesKey: (value: string) => boolean;
}

export default function providerKeys(this: ClayPage): void {
  const rows: KeyedRow[] = [];

  // the select's value as it holds it. the keys are filed under it lowercased, as the features read
  // a provider, and the row's conditions read it as it is, as the show and hide does
  const valueOf = (picker: ClayRow): string => String(picker.get() ?? '');

  // the keys, the spare, and the owner the phone wrote onto a row, or none for keys that do not read.
  // a provider with no name is left out, so a key is never filed under a blank select
  const readKeys = (written: unknown): { keys: Record<string, string>; spare: string; owner: string } => {
    try {
      const read = JSON.parse(decodeURIComponent(String(written)));
      const held = read && typeof read.keys === 'object' && read.keys && !Array.isArray(read.keys) ? read.keys : {};
      const keys: Record<string, string> = {};

      Object.keys(held).forEach((provider) => {
        if (provider !== '' && typeof held[provider] === 'string') {
          keys[provider.toLowerCase()] = held[provider];
        }
      });

      return { keys, spare: typeof read.spare === 'string' ? read.spare : '', owner: typeof read.owner === 'string' ? read.owner : '' };
    } catch (error) {
      return { keys: {}, spare: '', owner: '' };
    }
  };

  // whether the row takes a key for a value of the select. it reads the row's own conditions on the
  // select exactly as dependent-visibility.ts does, as text with its case and a notIn ahead of an in,
  // so a row this counts as hidden is the row the page hides. the plugin takes no key, and nor does a
  // blank select, which is no provider at all
  const takesKeyOf = (row: ClayRow, select: string) => (value: string): boolean => {
    const rule = row.config.visibleWhen;
    const conditions = (Array.isArray(rule) ? rule : rule ? [rule] : []).filter((condition) => condition && condition.key === select);
    const named = (list: unknown[]) => list.some((wanted) => String(wanted) === value);
    const hides = conditions.some((condition) => !(condition.notIn ? !named(condition.notIn) : named(condition.in || [])));

    return value !== '' && value.toLowerCase() !== 'plugin' && !hides;
  };

  // whose key a blank select shows, the owner on record when it takes a key, or nobody's
  const blankOwner = (entry: KeyedRow): string => (entry.owner && entry.takesKey(entry.owner) ? entry.owner : '');

  // files the row's value under a provider, or keeps a key on a row that takes none there as the
  // spare. a blank select files under the owner on record, and with none the row is the spare, so
  // emptying it clears the spare
  const file = (entry: KeyedRow, value: string): void => {
    const key = String(entry.row.get() ?? '');
    const provider = value === '' ? blankOwner(entry) : value;

    if (provider !== '' && entry.takesKey(provider)) {
      entry.keys[provider.toLowerCase()] = key;
    } else if (key.trim() !== '' || value === '') {
      entry.spare = key;
    }
  };

  // the key the row shows for a value of the select. a provider that needs a key and has none takes
  // the spare. a blank select shows its owner's key, and with no owner the spare without handing it
  // out, so a save that touches nothing writes back what the row held. that spare can be a key left
  // under a provider taking none, such as Yahoo, and the save then sends it to the watch under the
  // blank select. a blank select fetches with nobody's key anyway, and the wearer can empty the row to
  // clear it, which costs less than a key row that opens blank and wipes a working key on a save that
  // touched nothing
  const keyFor = (entry: KeyedRow, value: string): string => {
    const provider = value.toLowerCase();

    if (value === '') {
      const owner = blankOwner(entry).toLowerCase();

      return owner ? entry.keys[owner] ?? '' : entry.spare;
    }

    if (!entry.takesKey(value)) {
      return '';
    }

    if (!Object.prototype.hasOwnProperty.call(entry.keys, provider) && entry.spare) {
      entry.keys[provider] = entry.spare;
      entry.spare = '';
    }

    return Object.prototype.hasOwnProperty.call(entry.keys, provider) ? entry.keys[provider] : '';
  };

  this.on(this.EVENTS.AFTER_BUILD, () => {
    const store = this.getItemByMessageKey('PF_PROVIDER_KEYS');

    // writes every row's keys and spare into the store, the row's own value filed under the provider picked
    const keep = (): void => {
      const kept: Record<string, { keys: Record<string, string>; spare: string }> = {};

      rows.forEach((entry) => {
        file(entry, valueOf(entry.picker));
        kept[entry.select] = { keys: entry.keys, spare: entry.spare };
      });

      if (store) {
        store.set(encodeURIComponent(JSON.stringify(kept)));
      }
    };

    this.getAllItems().forEach((row) => {
      const marked = row.config && row.config.providerKeys;
      const select = marked && typeof marked.select === 'string' ? marked.select : '';
      const picker = select ? this.getItemByMessageKey(select) : undefined;

      if (!marked || !picker) {
        return;
      }

      const read = readKeys(marked.keys);
      const entry: KeyedRow = { select, row, picker, keys: read.keys, spare: read.spare, owner: read.owner, takesKey: takesKeyOf(row, select) };
      let current = valueOf(picker);

      rows.push(entry);

      // the phone has filed the saved row already, so the row opens on the picked provider's own key
      row.set(keyFor(entry, current));

      picker.on('change', () => {
        file(entry, current);
        current = valueOf(picker);
        row.set(keyFor(entry, current));
        keep();
      });

      row.on('change', keep);
    });

    keep();
  });
}
