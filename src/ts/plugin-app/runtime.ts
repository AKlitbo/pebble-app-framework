/**
 * The Pebble app's plugin runtime, as a plugin app's script sees it.
 *
 * A plugin app's script runs in the Pebble app's plugin runtime rather than PebbleKit JS, so its
 * `Pebble` has another set of calls. A face's `Pebble` is declared as a global for the phone code, and
 * a second global of the same name would clash with it wherever both are checked together. So these
 * are types, reached through `pluginPebble()`, rather than a global declaration. The settings page has
 * a bridge of its own, which page.ts declares itself, since it runs on the page as text.
 *
 * Only the calls the framework's plugin app helpers use, and the ones a plugin's source handler needs
 * for them, are described here. Core's plugin guide has the rest.
 */

import type { SourceEnvelope, SourceInstance } from '../plugin-sources/types';

/** What a source handler is asked for, and what a plugin passes to read another plugin's source. */
export interface SourceRequest {
  category: string;
  item: string;
  /** Another plugin's uuid, to read that plugin rather than the wearer's preferred one. */
  plugin?: string;
  properties?: string[];
  iconPixelSize?: { w: number; h: number };
  /** What made the Pebble app run the handler again, when a source it reads changed. */
  trigger?: unknown;
}

/** How a source handler answers. */
export interface SourceResponder {
  data(envelope: { validUntilMs?: number; instances: SourceInstance[] }): void;
  error(code: string, message?: string): void;
}

/** The plugin's own encrypted storage, which only the plugin can read and which goes when the app is removed. */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** A plugin app script's `Pebble`. */
export interface PluginPebble {
  registerSourceHandler(handler: (request: SourceRequest, respond: SourceResponder) => void | Promise<void>): void;
  registerConfigHandler(handler: (message: unknown, respond: (reply: unknown) => void) => void | Promise<void>): void;
  subscribeSource(request: SourceRequest): void;
  readSource(request: SourceRequest): Promise<SourceEnvelope>;
  refreshSources(sources: string[]): void;
  secureStorage: SecureStorage;
  /**
   * Asks whether the wearer granted a permission the appinfo lists, such as `Internet/finnhub.io`. It
   * answers `granted`, `denied`, or `prompt`. Left out on a Pebble app too old to have it.
   */
  permissions?: { query(permission: string): Promise<string> };
}

/**
 * The plugin runtime's `Pebble`, typed for a plugin app's script.
 *
 * @return The runtime's `Pebble`.
 */
export function pluginPebble(): PluginPebble {
  return (globalThis as unknown as { Pebble: PluginPebble }).Pebble;
}
