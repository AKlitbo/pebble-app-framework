/**
 * The types for Pebble app plugins, the sources the Pebble app serves to a face's phone code.
 *
 * The shapes follow the mobile app's own classes, so a field here is one the phone really sends.
 * Nothing the phone hands over is trusted, so every field read off a plugin list, an update, or an
 * error is typed as possibly missing and the readers in ts/plugin-shapes/shapes.ts check each one.
 *
 * The features reach this file with `import type` only. A value import from outside the folder
 * would leave a require behind for a file a face built without plugin sources does not have.
 */

import type { CalendarEvent } from '../calendar/ical';
import type { StockQuote } from '../stock/util';
import type { WeatherResult } from '../weather/util';
import type { FeatureContext, FeatureHooks } from '../pkjs/feature';

/** The words of a `shortText` or a `longText`. The plugin guide sizes a `shortText` at about 7 characters. */
export interface TextShape {
  text?: string;
}

/** A number and its unit, such as a temperature in °C or a wind speed in mph. */
export interface NumericValueShape {
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
}

/** A moment as epoch seconds UTC. */
export interface TimestampShape {
  value?: number;
}

/** A yes or no, such as whether an event lasts all day. */
export interface BooleanShape {
  value?: boolean;
}

/** The numbers of one series, with the unit they all share. A null is a missing point. */
export interface NumericSeries {
  values?: (number | null)[];
  unit?: string;
}

/** The text of one series. A null is a missing point. */
export interface TextSeries {
  values?: (string | null)[];
}

/** The moments of one series, as epoch seconds UTC. A null is a missing point. */
export interface TimestampSeries {
  values?: (number | null)[];
}

/**
 * Many readings of one property along an axis, such as the hours of a forecast.
 *
 * `start` is epoch seconds UTC and `stepSec` is the gap between points, so point `index` is the
 * reading at `start + index * stepSec`. Each shape inside carries its own `values`.
 */
export interface SeriesShape {
  start?: number;
  stepSec?: number;
  numericValue?: NumericSeries;
  shortText?: TextSeries;
  longText?: TextSeries;
  timestamp?: TimestampSeries;
}

/**
 * A colour bitmap in the watch's own 4-bit palettized layout, with both parts in base64. The pixels
 * go two to a byte with the even x in the high nibble, and each row is padded to a whole byte. The
 * palette is up to 16 GColor8 bytes. A plugin sends one only to a subscription that asks for images
 * with `iconPixelSize`, at about that size.
 */
export interface ImageShape {
  pixels?: string;
  palette?: string;
  width?: number;
  height?: number;
}

/** The names of the shapes the readers know, the way an update and a manifest spell them. */
export type ShapeName = 'shortText' | 'longText' | 'numericValue' | 'timestamp' | 'boolean' | 'series' | 'image';

/**
 * One property of an instance, offered in any of its shapes.
 *
 * A plugin sends the shapes it has, so a temperature can come as text and as a number side by side.
 * The `icon` shape is left out, since nothing here asks for one.
 */
export interface SourceProperty {
  shortText?: TextShape;
  longText?: TextShape;
  numericValue?: NumericValueShape;
  timestamp?: TimestampShape;
  boolean?: BooleanShape;
  series?: SeriesShape;
  image?: ImageShape;
}

/** A size in pixels, which a subscription asks a plugin's images at. */
export interface ImageSize {
  w: number;
  h: number;
}

/** One thing a plugin serves, such as one weather place or one calendar event. */
export interface SourceInstance {
  /** The plugin's own id for it, such as a place's key or an event's position in the list. */
  instanceId?: string;
  properties?: Record<string, SourceProperty | undefined>;
}

/** One update from a subscription. Each one is the whole list, never a change to the last one. */
export interface SourceEnvelope {
  /** The plugin that answered, which the page checks against the standard readings. */
  pluginUuid?: string;
  validUntilMs?: number | null;
  instances?: SourceInstance[];
}

/**
 * One block of a plugin's manifest, saying what it serves.
 *
 * `properties` maps each property name to the shapes it can come in, in the plugin's own order. A
 * series is spelled `series.` and its shape, as in `series.numericValue`.
 */
export interface SourceDeclaration {
  category?: string;
  items?: string[];
  properties?: Record<string, string[] | undefined>;
}

/** One installed plugin, as `Pebble.enumeratePlugins()` lists it. */
export interface PluginSummary {
  uuid?: string;
  name?: string;
  sources?: SourceDeclaration[];
  actions?: unknown[];
}

/**
 * An error from a subscription, or the marker the subscription reports itself when no plugin serves
 * the item. The code is one the phone uses, such as `PERMISSION_DENIED`, or `noPlugin`.
 */
export interface SourceError {
  code: string;
  message: string;
}

/** What a subscription keeps in localStorage for the settings page to read. */
export interface SourceState {
  /** The plugin behind the last update, or null before the first one or after no plugin has served the item. */
  pluginUuid: string | null;
  /** The code of the last error, or null once an update has landed since. */
  lastError: string | null;
  /** Whether the last update held no instances. */
  lastEmpty: boolean;
}

/** What a feature hands a subscription. */
export interface SubscriptionOptions {
  category: string;
  item: string;
  /** The properties the feature reads, which the phone takes as a hint. */
  properties?: string[];
  /**
   * The size the feature wants images at, which asks the plugin for them. Left out, the phone asks
   * for none, and a plugin draws none, since a bitmap costs it far more than text.
   */
  iconPixelSize?: ImageSize;
  /** Gets each update the plugin sends. */
  onUpdate(envelope: SourceEnvelope): void;
  /** Gets each error, and `noPlugin` on every start that finds nothing serving the item, but once across the retries after it. */
  onError(error: SourceError): void;
  /**
   * Whether the unit tries again every `QUICK_RETRY_MS` on its own while it sits idle. On unless set
   * to false. With it off, the unit retries only on `retryIfIdle`, and `retrySoon` is one try rather
   * than a window, for a source nothing on the watch waits on.
   */
  quickRetry?: boolean;
}

/** One feature's live subscription, as subscription.ts builds it. */
export interface SourceSubscription {
  /** Ends any live subscription, then subscribes again unless the plugin list says nothing serves the item. */
  start(): void;
  /** Ends the subscription and leaves plugin mode, so neither the slow tick nor the quick retry brings it back. */
  stop(): void;
  /**
   * Starts again only while in plugin mode with nothing live. The slow tick calls it, and the unit
   * runs the same retry on its own every `QUICK_RETRY_MS` while it sits idle in plugin mode. It has
   * `QUICK_RETRY_WINDOW_MS` of those from a start or a `retrySoon()`, spent only while it sits idle,
   * so a subscription that ends long after it went live still gets them then.
   */
  retryIfIdle(): void;
  /**
   * Gives the quick retry its whole window again, for a wearer who is setting up a plugin right now,
   * such as one who just opened the settings page or saved the plugin as the source. It starts the
   * retry if the unit sits idle in plugin mode, and does nothing else. With the quick retry off it
   * tries once, the same as `retryIfIdle`.
   */
  retrySoon(): void;
  /** The last update, or null before the first one. */
  latest(): SourceEnvelope | null;
  /** Whether a subscription is running that the phone has not ended. */
  live(): boolean;
  /**
   * The installed plugins, an empty list when the phone has none or no plugin calls at all, or null
   * when its list call throws or answers with something that is not a list. Unreadable is not empty,
   * since the phone may still route a subscription to a plugin it would not list.
   */
  plugins(): PluginSummary[] | null;
  /** What the subscription saved for the settings page. */
  state(): SourceState;
}

/** What a feature hands its kind's plugin driver to reach the watch. */
export interface ReadingControls<Reading> {
  /** Sends a reading to the watch through the feature's deduped sender. */
  send(reading: Reading): void;
  /** Forgets what the watch holds, so the next send goes even when it matches. */
  forget(): void;
  /** The size the face wants the kind's images at, such as now playing art. Left out, it asks for none. */
  imageSize?: ImageSize;
}

/**
 * What a feature hands its kind's plugin driver: how it sends a reading, and how it fetches while
 * the plugin is not the wearer's choice. The driver decides which of the two runs, and the feature
 * keeps only the fetch it has always had.
 */
export interface FetchControls<Reading> extends ReadingControls<Reading> {
  /** Drops a fetch round still out, so its answer cannot land over the plugin's. */
  shutOut(): void;
  /** Starts a fetch round, the way the feature does on a face without plugins. */
  fetch(force: boolean): void;
  /** Starts the fetch a ready or a watch ask calls for, unless another ask just did. */
  askFetch(): void;
  /** Starts the fetch a slow tick calls for, unless an ask just covered it. */
  slowFetch(): void;
  /** Runs something once the wait after a settings save has passed. */
  afterSave(run: () => void): void;
}

/** What the weather feature hands its plugin driver, beside the fetch controls. */
export interface WeatherControls extends FetchControls<WeatherResult> {
  /** The reading fields the face shows, such as `humidity`, named as on `WeatherResult`. */
  fields: string[];
  /** Whether the face shows the forecast strips. */
  wantForecast: boolean;
  /** Whether the face shows coordinates, which a weather plugin serves only as `latitude` and `longitude` when it has them. */
  withCoords: boolean;
  /** Every weather setting whose change is worth a refetch after a save, the feature's `WEATHER_KEYS`. */
  settingKeys: string[];
  /**
   * Has every later fetch ask its provider in the unit this reads, rather than the face's saved
   * setting. The driver calls it only for a face with no temperature unit of its own.
   */
  useUnit(fahrenheit: () => boolean): void;
  /** Whether a save's refetch is still waiting to run, which reads the unit only when it does. */
  savePending(): boolean;
}

/** What the calendar feature hands its plugin driver. */
export type CalendarControls = FetchControls<CalendarEvent[]>;

/** What the stock feature hands its plugin driver, beside the fetch controls. */
export interface StockControls extends FetchControls<StockQuote[]> {
  /** Every stock setting whose change is worth a refetch after a save, the feature's `STOCK_KEYS`. */
  settingKeys: string[];
  /**
   * Lets go of the strip and the stamps kept for the provider's old settings, and drops a round still
   * out, as a save that changed them does on a face without plugins. The forced refetch after it then
   * goes past the quota gate.
   */
  forgetFetched(): void;
}

/**
 * What the weather feature gets from a face built with `PLUGIN_WEATHER`.
 *
 * The feature reads it from plugin-sources/index, where it is null for a face built without the
 * define, and then runs exactly as it does on a face that never heard of plugins.
 */
export interface WeatherPlugins {
  /**
   * Runs the weather in plugin mode beside the feature's own fetch.
   *
   * @param context What the app shared with the feature.
   * @param controls The feature's send and fetch.
   * @return The hooks the feature hands the app, or null for a face that shows coordinates, lists
   *   more than the plugin, and has a temperature unit of its own, which only fetches.
   */
  driver(context: FeatureContext, controls: WeatherControls): FeatureHooks | null;
}

/** The calendar's plugin mode, as its driver hands it back. */
export interface CalendarDriver {
  /** The hooks the feature hands the app. */
  hooks: FeatureHooks;
  /** Whether an iCal round with no link sends nothing rather than an empty agenda, for now. */
  holdsEmptyAgenda(): boolean;
}

/**
 * What the calendar feature gets from a face built with `PLUGIN_CALENDAR`. It is null in
 * plugin-sources/index for a face built without the define, as weather's is.
 */
export interface CalendarPlugins {
  /**
   * Runs the calendar in plugin mode beside the feature's own iCal rounds.
   *
   * @param context What the app shared with the feature.
   * @param controls The feature's send and iCal rounds.
   * @return The hooks and the agenda hold.
   */
  driver(context: FeatureContext, controls: CalendarControls): CalendarDriver;
}

/**
 * What the stock feature gets from a face built with `PLUGIN_STOCKS`. It is null in
 * plugin-sources/index for a face built without the define, as weather's is.
 */
export interface StockPlugins {
  /**
   * Runs the stocks in plugin mode beside the feature's own provider rounds.
   *
   * @param context What the app shared with the feature.
   * @param controls The feature's send and provider rounds.
   * @return The hooks the feature hands the app.
   */
  driver(context: FeatureContext, controls: StockControls): FeatureHooks;
}

/**
 * What the phone battery feature gets from a face built with `PLUGIN_PHONE`. It is null in
 * plugin-sources/index for a face built without the define.
 */
export interface PhonePlugins {
  /**
   * Reads the phone's battery from the Pebble app's Phone plugin.
   *
   * @param context What the app shared with the feature.
   * @param controls The feature's send, which takes the level from 0 to 100, -1 for none, or -2 while no
   *   plugin serves the battery.
   * @return The hooks the feature hands the app.
   */
  driver(context: FeatureContext, controls: ReadingControls<number>): FeatureHooks;
}

/**
 * Now playing art, checked and ready to pack. The pixels are the watch's own 4-bit palettized bitmap,
 * two to a byte with the even x in the high nibble and each row padded to a whole byte, and the
 * palette holds one GColor8 byte for each colour.
 */
export interface MusicArtwork {
  width: number;
  height: number;
  palette: number[];
  pixels: number[];
}

/** What the phone is playing, as the watch takes it. Empty text and playing off is nothing playing. */
export interface MusicTrack {
  /** The song's title in ASCII, or empty when there is none to show. */
  title: string;
  /** Who it is by, in ASCII, or empty when there is none to show. */
  artist: string;
  /** Whether it is playing rather than paused. */
  playing: boolean;
  /** Whether no plugin on the phone serves now playing, which the watch hears as its own state. */
  noPlugin?: boolean;
  /** The track's art, or null for none, which clears the watch's. Left out when the face asks for no art. */
  art?: MusicArtwork | null;
}

/**
 * What the now playing feature gets from a face built with `PLUGIN_MUSIC`. It is null in
 * plugin-sources/index for a face built without the define.
 */
export interface MusicPlugins {
  /**
   * Reads what the phone is playing from a music plugin.
   *
   * @param context What the app shared with the feature.
   * @param controls The feature's send, which takes the track.
   * @return The hooks the feature hands the app.
   */
  driver(context: FeatureContext, controls: ReadingControls<MusicTrack>): FeatureHooks;
}
