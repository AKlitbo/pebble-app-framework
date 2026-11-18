/**
 * The parts of a Clay settings page that a plugin app's page code reaches, written once for the
 * framework's page code and a plugin app's own.
 *
 * Clay writes page code into the page as text, so page code takes these with `import type`. TypeScript
 * drops a type-only import when it compiles, so nothing is left for the page to load.
 */

/** A Clay row as page code reaches it. */
export interface ClayPageRow {
  /** The row as the page was built from it, its `moduleOptions` included, which page code reads in its own shape. */
  config: { id?: string; messageKey?: string; moduleOptions?: unknown };
  /** The row's own element, first and only. */
  $element: HTMLElement[];
  get(): unknown;
  set(value: unknown): void;
  hide(): void;
  show(): void;
  on(event: string, handler: () => void): void;
}

/** The Clay config page, which runs page code with itself as `this`. */
export interface ClayPage {
  EVENTS: { AFTER_BUILD: string };
  on(event: string, handler: () => void): void;
  getAllItems(): ClayPageRow[];
  getItemById(id: string): ClayPageRow | undefined;
  getItemByMessageKey(messageKey: string): ClayPageRow | undefined;
  /** Every row with a message key, by key, as Clay would save it. */
  serialize(): Record<string, { value: unknown }>;
}

/** The page's bridge to the plugin, as the Pebble app gives a plugin app's settings page on `window.Pebble`. */
export interface PluginPageBridge {
  addEventListener(name: string, listener: (event: { target: string }) => void): void;
  sendMessage(target: string, message: unknown): Promise<unknown>;
}
