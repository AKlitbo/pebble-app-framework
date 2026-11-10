/**
 * PebbleKit JS runtime globals and the shapes the app talks to. Ambient (global),
 * so app.ts uses these without importing. Only the surface the phone code touches is typed.
 * There is no upstream @types for PebbleKit JS.
 */

/** The AppMessage dict: message-key -> value the watch decodes. */
type AppMessageDict = Record<string, number | string | number[]>;

/** The event the 'appmessage' listener receives. */
interface PebbleAppMessageEvent {
  payload?: Record<string, number | string>;
}

/** The event the 'webviewclosed' listener receives (the saved settings JSON). */
interface PebbleWebviewClosedEvent {
  response?: string;
}

/** The PebbleKit JS bridge object the app sends messages and listens through. */
interface PebbleBridge {
  sendAppMessage(dict: AppMessageDict, onSuccess?: () => void, onError?: () => void): void;
  openURL(url: string): void;
  addEventListener(type: 'ready' | 'showConfiguration', handler: () => void): void;
  addEventListener(type: 'appmessage', handler: (event: PebbleAppMessageEvent) => void): void;
  addEventListener(type: 'webviewclosed', handler: (event: PebbleWebviewClosedEvent) => void): void;

  // the plugin calls are only on a phone that has them, so both are optional. they are typed
  // unknown because this file imports nothing, and plugin-sources/subscription.ts checks what comes back
  /** The installed plugins. */
  enumeratePlugins?(): unknown;
  /** Subscribes to one category and item, and hands back a handle carrying unsubscribe. */
  subscribeToSource?(request: unknown): unknown;
}

declare const Pebble: PebbleBridge;

/** The Clay class the deferred require('@rebble/clay/...') returns. */
interface ClayConstructor {
  new (config: unknown, customClay?: unknown, options?: { autoHandleEvents?: boolean }): {
    registerComponent(component: unknown): void;
    getSettings(json: string): AppMessageDict;
    generateUrl(): string;
    // generateUrl writes the page from these two each time it runs, so setting them after the
    // constructor changes the next page that opens. they are typed loosely because this file imports
    // nothing. Clay deep copies the page it was built with into config, and keeps a do-nothing
    // function in customFn when it was given none
    /** The settings page the next generateUrl writes. */
    config: unknown[];
    /** The function the page runs before it builds. */
    customFn: unknown;
    /** Every component registered so far, by name. Clay registers its own for each type the page it was built with uses. */
    components: Record<string, unknown>;
  };
}

// the CommonJS loader for the deferred Clay / message_keys lookups (they load
// lazily so the specs can skip them). message_keys is a face-generated map whose
// keys are present-or-undefined and used both as computed keys and in presence
// checks so its value is genuinely dynamic
declare function require(id: string): any;
