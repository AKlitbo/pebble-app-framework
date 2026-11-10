/**
 * The message keys and appinfo fields the build fills in for a face, from its features and defines.
 *
 * A feature a face passes startPebbleApp carries the keys it cannot run without, such as the four
 * weather keys, and a plugin define needs the keys its kind fills. The build adds each one the face
 * does not list, after the face's own keys, so a face lists only the keys that are its own choice: its
 * settings, the weather groups and coordinates it reads, and the settings pair, which a kept plugin
 * source choice brings too. It also fills in the appinfo fields every face would repeat, the SDK
 * version, multi JS, and the capabilities the features and the settings page need.
 *
 * The SDK numbers the keys from the list, so the face's own keys keep their places and the added ones
 * go at the end. A face that still lists every key gets the list it gave, and the same numbers.
 */
import { ToolError } from '../shared/tool-error.ts';
import { keyNames } from './message-keys.ts';
import { pluginKindsOn } from './plugin-kinds.ts';
import { pluginKindMode, sentenceList } from './providers.ts';
import type { ProviderLists } from './providers.ts';

/** What the build reads from a face's compiled phone code before it writes the sandboxes. */
export interface FaceStartFacts {
  /** Whether the face's phone code calls startPebbleApp, which gives it a settings page. */
  started: boolean;
  /** The keys the features the face passes need, each once, in the order the face passes them. */
  featureKeys: string[];
}

/** What a face with no phone code of its own, or none read yet, starts with. */
export const NO_START: FaceStartFacts = { started: false, featureKeys: [] };

/** The SDK version the build writes for a face that leaves it out. */
export const SDK_VERSION = '3';

/**
 * The keys the features need, read off each feature's messageKeys, each once.
 *
 * A feature is a function, so the list rides on it as a property. Anything that is not a list of names
 * counts as none, since a face's own feature may carry nothing.
 *
 * @param features The features the face hands startPebbleApp, in its order.
 * @return The keys, in the order the face passes the features and each feature lists them.
 */
export function featureKeys(features: readonly unknown[]): string[] {
  const keys = features.flatMap((feature) => {
    const listed = typeof feature === 'function' ? (feature as { messageKeys?: unknown }).messageKeys : undefined;

    return Array.isArray(listed) ? listed.filter((key): key is string => typeof key === 'string') : [];
  });

  return [...new Set(keys)];
}

/** The keys the phone asks for the watch's settings with and the watch answers whether it booted empty with. */
const SETTINGS_PAIR = ['SETTINGS_REQUEST', 'SETTINGS_FRESH'];

/**
 * The keys the face's plugin defines need, which are the kind's keys and its select key.
 *
 * A plugin only list keeps no choice on the watch, so it brings no select key. readProviders refuses
 * the select key beside one. A kind with the select key keeps the wearer's pick on the watch, which
 * only goes back to the phone in the settings reply, so it brings `SETTINGS_REQUEST` and
 * `SETTINGS_FRESH` too. A face with no settings of its own would otherwise lose the pick on a
 * reinstall of the Pebble app.
 *
 * @param defines The face's defines, from readDefines.
 * @param providers The face's providers list, from readProviders.
 * @return The keys, in the table's order of the kinds.
 */
export function pluginDefineKeys(defines: Record<string, number>, providers: ProviderLists): string[] {
  const keys = pluginKindsOn(defines).flatMap((kind) => {
    const select = kind.selectKey && pluginKindMode(kind, providers) !== 'plugin' ? [kind.selectKey, ...SETTINGS_PAIR] : [];

    return [...kind.keys, ...select];
  });

  return [...new Set(keys)];
}

/**
 * The face's message keys with the added ones after them.
 *
 * Each key goes in once by name, with any [n] taken off to compare, so a key the face lists keeps its
 * place and its form, a listed array key such as `SLOT[2]` covers `SLOT`, and an added `SLOT[2]` is
 * covered by a listed `SLOT`. A face that lists every added key gets back the value it
 * gave. A map gives each key its number by hand, so the build adds nothing to one and refuses a map
 * that leaves out a key it would add.
 *
 * @param listed The face's message keys, as its appinfo declares them, a list or a map.
 * @param added The keys the features and the defines need, in the order they go in.
 * @param face The face the appinfo belongs to, which a refusal names.
 * @return The message keys the manifest carries.
 */
export function withAddedKeys(listed: unknown, added: readonly string[], face: string): unknown {
  // an added key is matched by its name as a declared one is, so SLOT[2] and SLOT are one key
  const seen = new Set(keyNames(listed));
  const missing = added.filter((key) => {
    const name = key.split('[')[0];
    const fresh = !seen.has(name);

    seen.add(name);
    return fresh;
  });

  if (missing.length === 0) {
    return listed;
  }

  if (listed === undefined || listed === null) {
    return missing;
  }

  if (!Array.isArray(listed)) {
    throw new ToolError(`${face}'s appinfo gives messageKeys as a map, which numbers each key by hand, so the build cannot add ${sentenceList(missing)}, which its features and defines need. Add them to the map, or give messageKeys as a list of names`);
  }

  return [...listed, ...missing];
}

/** The appinfo fields the build fills in, as a face writes them. */
export type FillableAppinfo = {
  messageKeys: unknown;
  sdkVersion?: string;
  enableMultiJS?: boolean;
  capabilities?: unknown;
};

/**
 * The face's appinfo with the keys and the fields every face would repeat filled in.
 *
 * The message keys get the features' and the defines' keys after the face's own. The SDK version is 3
 * and multi JS is on when the face leaves them out. The SDK reads a missing multi JS as off and then
 * bundles none of the framework's phone code, so the build refuses a face that turns it off.
 *
 * The capabilities are the face's own, then location for a face with weather, since its phone side may
 * look the wearer up by GPS, then configurable for a face whose phone code calls startPebbleApp, since
 * that is what builds its settings page. Weather is the WEATHER_REQUEST key, the same rule the
 * usesPermissions list goes by for Location. Health stays the face's to list, since the build cannot
 * see whether the watch code reads Pebble Health.
 *
 * @param config The face's appinfo.
 * @param face The face the appinfo belongs to, which a refusal names.
 * @param start What the build read from the face's compiled phone code.
 * @param defines The face's defines, from readDefines.
 * @param providers The face's providers list, from readProviders.
 * @return A copy of the appinfo with the keys and the fields filled in.
 */
export function fillAppinfo<T extends FillableAppinfo>(config: T, face: string, start: FaceStartFacts, defines: Record<string, number>, providers: ProviderLists): T & FillableAppinfo {
  if (config.enableMultiJS === false) {
    throw new ToolError(`${face}'s appinfo sets enableMultiJS to false, which leaves the framework's phone code out of the pbw. Take enableMultiJS out of the appinfo, and the build turns it on`);
  }

  if (config.capabilities !== undefined && !Array.isArray(config.capabilities)) {
    throw new ToolError(`${face}'s appinfo capabilities has to be a list, such as ["health"]`);
  }

  const messageKeys = withAddedKeys(config.messageKeys, [...start.featureKeys, ...pluginDefineKeys(defines, providers)], face);
  const capabilities: unknown[] = [...((config.capabilities ?? []) as unknown[])];
  const needed = [
    ...(keyNames(messageKeys).has('WEATHER_REQUEST') ? ['location'] : []),
    ...(start.started ? ['configurable'] : []),
  ];

  needed.filter((name) => !capabilities.includes(name)).forEach((name) => capabilities.push(name));

  return {
    ...config,
    messageKeys,
    sdkVersion: config.sdkVersion ?? SDK_VERSION,
    enableMultiJS: true,
    // a face that lists none and needs none gets a manifest with no capabilities
    capabilities: config.capabilities === undefined && capabilities.length === 0 ? undefined : capabilities,
  };
}
