# Plugin Apps

A plugin app is a Pebble app plugin of your own, built with the framework. It has no watch code. It runs in the Pebble app on the phone and serves data to every watchface that reads its kind of data, not only yours. [Pebble App Plugins](plugin-sources.md) covers the other side, a face reading a plugin.

Plugins are still a Core Devices preview in the Pebble app, which keeps them off until the wearer turns them on under Settings, Plugins, Plugins / permissions preview. A plugin app publishes to the appstore with `pebble publish` like any other app. Building one needs Pebble SDK 4.44 or later and pebble-tool 5.1.2 or later.

## What One Looks Like

A plugin app is a face folder whose appinfo says it is a plugin. A repo of them keeps each one as a unit under `plugins/`, which paf finds the way it finds `watchfaces/` and `watchapps/`, and each one pins framework 6 or later.

```
plugins/calendar-ical/
  paf.config.json       the framework tag and the plugins the unit lists
  package.json          with workspaces: ["paf", "paf/plugins/*"]
  pebble.appinfo.json   with "projectType": "plugin"
  src/plugin/index.ts   the plugin's script, where it starts
  src/config/index.ts   its settings page, when it has one
```

## The Appinfo

```json
{
  "name": "calendar-ical",
  "displayName": "Calendar + iCal",
  "uuid": "…",
  "version": "1.0.0",
  "sdkVersion": "3",
  "projectType": "plugin",
  "configPage": "config.html",
  "usesPermissions": [{ "name": "Calendar", "reason": "To merge your phone's calendars", "required": true }],
  "plugin": { "description": "…", "sources": [ … ] }
}
```

The `plugin` block is the Pebble SDK's own, and goes into the pbw as written. A plugin app's `usesPermissions` go in as written too, each with its `reason` and `required` flag, where a face's are worked out from its keys. The build writes the plugin's script as `plugin.js` and its settings page as `config.html`, so a plugin block naming another script, or a `configPage` other than `config.html`, is refused. `"configPage": "config.html"` is what builds the settings page, so a plugin app without it gets no page, even with a `src/config/index.ts`.

A plugin app has no watch code, so the fields only watch code uses are refused, naming the field: `messageKeys`, `resources`, `defines`, `textDefines`, `providers`, `targets`, `watchapp`, `watchface`, `menuIcon`, `targetPlatforms`, and `enableMultiJS`. The build also refuses a `projectType` other than `plugin` or `native`, which is what `pebble new-project` writes for a watchface, so a misspelled plugin app does not build as a face. A plugin app has no features and no message keys, so the build reads no features from it and fills in none of the fields it fills in for a face, as [The Fields the Build Fills In](talking-to-the-phone.md#the-keys-a-face-does-not-list) covers. Its `sdkVersion` and any `capabilities` go in as the appinfo writes them.

## The Build

`paf build <plugin app>` writes the plugin app's sandbox under `targets/`, bundles its script into `plugin.js`, builds its settings page into `config.html`, and runs `pebble build` there. It runs none of a face's phone build, settings page check, or header. The sandbox gets the SDK's own plugin wscript, which builds no watch code. With no watch code there is nothing for the `dev` plugin's dev mode to change, so `--dev` stops the build.

The script is bundled with esbuild from `src/plugin/index.ts` into one file, since the Pebble app loads a plugin's script as one. It imports the framework by relative path from `paf/`, as a face does, and everything it reaches goes into the bundle. The framework's iCal reader brings ical.js with it, with its MPL licence header kept at the top of its part of the bundle, and a build stops on an ical.js that does not open with that header rather than shipping without it. The bundle targets ES2017, the plugin runtime has `fetch` but no timers and no `XMLHttpRequest`, and esbuild's warnings print with the build.

## The Settings Page

A plugin app's settings page is a Clay page, written as a Clay config the way a face writes one. `src/config/index.ts` exports `clayConfig`, and can export a `customClay` written with the `function` keyword. It is bundled the way the script is, so its imports resolve the same way.

The page's storage is not the plugin's, so the page asks the plugin for the saved settings when it opens and hands them back on Save, and the plugin keeps them. The build adds what that takes:

* **The Framework's Page Code** runs ahead of the plugin's `customClay`, after the framework's show and hide for `visibleWhen` rows. It loads the saved settings once the plugin is ready, and turns Save on only once they have loaded, so a page still on its defaults cannot save over the wearer's. Save closes the page only when the plugin answers that it kept them.
* **A Status Row** sits above the Save button, where a load or a save that fails, or that the plugin has not answered after five seconds, says why.
* **A Save Button** goes at the foot of a page with none.

A row that names watch capabilities is refused, since a plugin's page opens with no watch behind it.

On the plugin side, `handleSettings` from `ts/plugin-app/settings.ts` answers the page, and `readSettings` reads the settings back in a source handler:

```ts
import { handleSettings } from '../../paf/ts/plugin-app/settings';

const OPTIONS = { secret: ['FEED1_URL'], defaults: { REFRESH: '30' }, refresh: ['calendar/event'] };

handleSettings(OPTIONS);
```

A key marked secret, such as a private iCal link, goes to `Pebble.secureStorage`, which the phone encrypts and only the plugin can read, and the rest go to `localStorage`. A save writes the secrets first, so one that fails leaves the other settings as they were, and then has the Pebble app read the sources in `refresh` again. A secret that cannot be read fails the page's load, so the next save cannot delete it, and keeps its default in a source handler. `ts/plugin-app/runtime.ts` types the plugin runtime's `Pebble` through `pluginPebble()`.

`paf tool <plugin app> clay-preview` builds the same page for a desktop browser. A stand-in for the Pebble app loads the values a `--settings` file holds, and a Save shows in the console what it would have sent.

## Serving Calendar Events

`ts/plugin-app/calendar.ts` serves the framework's `CalendarEvent`s as the standard `calendar/event` source, in the shapes the Pebble app's built-in Calendar plugin uses, so every face that reads the built-in reads a plugin app the same way. `eventInstance(event, instanceId)` makes one instance. The texts go out as both `shortText` and `longText`, apart from the end's label, which is `shortText` only, as the built-in sends them. The start and end each carry a label beside their timestamp, the time on the phone's clock as `HH:MM` or `All day`, and a blank location is left out.

`CALENDAR_EVENT_SOURCE` is the source's declaration. The appinfo is JSON, so copy it into the plugin block's `sources` as written. The Pebble app drops any property or shape the block does not declare, and nothing checks the copy, so a spec comparing the two keeps them together. It asks `Calendar` of its callers, which the Pebble app requires of a plugin that reads the phone's calendars through the built-in.

An all-day event goes out from UTC midnight of its first day to UTC midnight after its last, as the built-in sends one on Android, and a face's reader rounds that to the phone's own midnight. On a phone at UTC+13 or further east, such as New Zealand in summer, UTC midnight is past local noon, so an all-day event reads a day late there, as the built-in's own do.

`CalendarEvent` carries a feed's `uid` from the iCal reader and a calendar's name from the plugin reader, for a plugin that merges several sources. Every occurrence of a repeating event shares its series' `uid`, so the `uid` and the start together pick out one meeting.

## Serving Stock Quotes

`ts/plugin-app/stocks.ts` serves the framework's `StockQuote`s as `finance/stock`, modelled on Pebble's own Stocks plugin, with properties of our own added. `stockInstance(quote, instanceId, extras)` writes Pebble's five properties, `ticker`, `name`, `price`, `day_change`, and `day_change_percent`, in exactly Pebble's text, such as `$187.42`, `$187.42  +0.52%` for the long price, `-$1.20`, and `+0.52%`, so a face written against Pebble's reads a plugin app with no change. A quote from a provider that sends no currency, such as Finnhub, goes out with no sign. A price in pence stays `GBp`, written as its code. Pebble's works the day's change out from Yahoo's `previousClose`, while the framework's Yahoo provider uses `chartPreviousClose`, so the two can differ by a little on the same ticker.

On top of Pebble's five, an instance carries the price and both changes as numbers, the quote's `currency` code, when the quote is from as `updated`, and the `source` and `market` a plugin passes in `extras`. A ticker with no price goes out with its ticker, its name, and its status word in `status`, such as `NO ACCESS`, rather than being left out. A face reading only Pebble's five properties shows its own dash for the missing price.

`STOCK_SOURCE` is the source's declaration, to copy into the plugin block's `sources` as written.

## Serving the Weather

`ts/plugin-app/weather.ts` serves a `WeatherReading` from the weather providers' `fetchReading` as the standard `weather/location`, modelled on the Pebble app's built-in Weather plugin. `WEATHER_LOCATION_SOURCE` is the source's declaration, to copy into the plugin block's `sources` as written. Its standard properties are the built-in's, in the built-in's shapes without `icon` and `image`, and its extras are Weather+'s. Every series is named `hourly_` or `daily_`, and nothing else is.

`weatherLocations(pebble)` reads the wearer's places from the built-in Preferences plugin, `BUILT_IN_PREFERENCES`, by its uuid, and subscribes to them so the Pebble app runs the plugin again when the list changes. It hands back each place's key, name, coordinates, and whether it is the current location, in the wearer's order, and leaves out a place with no coordinates, such as a current location with no fix yet. A read the Pebble app refuses hands back no places and the reason. `pebbleAppUnits(pebble, overrides)` reads the wearer's units the same way, and puts the plugin's own choice over each one, where `app`, or a choice that is not one of the Pebble app's own units, follows the Pebble app. Units the Pebble app does not give are °C, km/h, and hPa, so serving always has a unit to send. `readPebbleAppUnits(pebble, overrides)` reads the same units for a caller that has to tell the Pebble app's own from the defaults, such as a settings page showing them: a refused read answers `units` null and the reason, and a reply that names none answers null and `NO_UNITS`.

`locationInstance(reading, place, units, asked, nowMs)` turns one place's reading into its instance, under the place's key. It sends every single value, and each series only when `asked` names it, or every series when the request names none, as the built-in does. Temperatures go out in °C or °F, wind in km/h, mph, m/s, or knots, and pressure in hPa or inHg, each with its unit and a short text in the built-in's style, such as `24°C`, `12 km/h`, or `30.01 inHg`. `condition` is the framework's words for the sky, with a `shortText` of 12 characters or fewer, since the Pebble app cuts it there for its timeline pins. `condition_code` is one of the standard's nine codes from `CONDITION_CODES`, and `weather_code` and its series carry the WMO code. `utc_offset` is in minutes east of UTC, and `uv_index` is the day's peak, both as the built-in sends them. The series keep the reading's stamps, so a reader places each point by its time, as [Fetching the Weather](fetching-the-weather.md#a-reading-for-a-plugin-app) covers. `source` names the provider, and `updated` carries when the reading is from with its time on the phone's clock.

**Stamping a Run.** Each `fetchReading` takes an optional last argument, `onSend`, which hears each request as it goes out, before it is sent. It names the provider as `source`, how many calls the request counts as, and the weight of each: the Open-Meteo batch as `openmeteo` with one call for each place in it at `READING_WEIGHT`, and each place's call to OpenWeatherMap or WeatherAPI.com under its own name, as one call of weight 1. Stamp the ledger there. The hook can hand back a function, which hears the request's error once it answers, so a request that answers `NETWORK_ERROR` from `ts/pkjs/request.ts`, the text `pluginRequest` gives a fetch that never reached the host, has its stamps taken back off. A request that throws answers `NETWORK_ERROR` too. A body `pluginRequest` cannot read after the host answered gives the status with no body, since the provider counted the call. With no key, or no place to ask, nothing is sent and the hook hears nothing. A hook or a returned function that throws is logged and passed over, so the run still finishes.

**The Days the Pebble App Needs.** The Pebble app builds the watch's own Weather app from an instance only when it holds today's and tomorrow's high, low, condition code, sunrise, and sunset. `locationInstance` answers null for a reading without two days from the place's today, a reading whose Open-Meteo half failed included. Leave that place out of the answer, so the Pebble app fills it from its own backend, or serve a failover reading for it. Through a polar night or a midnight sun the sunrise and sunset are gaps, so the instance goes out for faces and the Pebble app takes that place from its backend, as it would for the built-in.

## Fetching from a Plugin App

A plugin app's runtime has no `XMLHttpRequest` and no timers, so the face's request in `ts/pkjs/request.ts` cannot run there. `pluginRequest` in `ts/plugin-app/request.ts` is the same call on the runtime's `fetch`, so the framework's weather and stock providers take it unchanged. It reports a non-2xx answer as `http <status>` with its body, so a 429 still reads as a rate limit, and gives a fetch up after 8 seconds with `AbortSignal.timeout` where the runtime has it. `fetchText` is the same fetch for a whole document, such as an iCal feed.

`fetchQuotes(symbols, opts, request)` in `ts/stock/quotes.ts` fetches a quote for each ticker from one provider and answers them in order, with a ticker whose fetch or provider throws answered as `ERR`. A failed quote carries no ticker, so read the answers by their order. Every ticker starts at once, and the runtime has no timers to space them, so under Alpha Vantage's free key ask for one ticker a run and serve the quotes held for the rest. Without `AbortSignal.timeout` a fetch that never answers holds the round until the Pebble app ends the run. `roundStamps(results, nowMs)` is the rule the stock feature uses for which rounds count against a provider's quota, and `roundWait`, `rateLimitWait`, and `shouldThrottleStockFetch` in `ts/stock/schedule.ts` are its waits and floors, so a plugin keeps a metered plan to the same count a face does. `allowance` in `ts/stock/ledger.ts` says how many calls fit inside a free plan, from the time each call went out, and `keepSent`, `loadLedger`, and `saveLedger` keep those times, per provider and per key by its `keyPrint`. `COUNTED` names the providers it counts, and `STOCK_QUOTA_PLANS` holds their plans. Stamp each call and save the stamps as it goes out, since the Pebble app can end a run partway through. A plugin and a face on the same key each keep their own stamps, so together they spend the key twice. `parseSymbols(raw, max)` in `ts/stock/symbols.ts` parses the wearer's ticker list with a cap of the caller's choosing.

## Counting a Provider's Calls

`ts/quota/ledger.ts` is the ledger the stock feature counts with, for any metered provider. A `QuotaPlan` lists the provider's limits, each a number of calls in a `minute`, `hour`, `day`, or `month` window. A limit that `follows: 'clock'` starts again on the UTC minute, hour, midnight, or the 1st, and one that follows `'rolling'` counts back from now, with a rolling month as the last 31 days. `routineMax` holds back the last few calls of a limit for the wearer's own asks, and `keyed: false` marks a keyless provider.

`allowance(plan, stamps, ask, nowMs)` says how many calls fit now and when the rest would. `ask` carries the number of calls, the `weight` of each for a provider that bills a big request as several calls, `force` for the wearer's own ask, and `paid` for a paid plan, which counts nothing. A weight is 1 or more, so one under 1 counts as 1, and an ask whose weight is not a number above 0 gets no room. `windowOpensAt(limit, nowMs)` says when a limit that is full now opens again, for a provider that answers `RATE LIMIT` on its own: the next UTC minute, hour, midnight, or 1st with the same margin `allowance` waits, or a rolling window's length from now. A `fetchReading` status of `RATE LIMIT` carries `limit` when the provider names the limit it hit, as WeatherAPI.com's quota code 2007 gives `month`, and a bare 429 names none. `planFor(plans, id)` looks a plan up by provider id, finding nothing for an id such as `constructor`.

`addStamp` stamps each call with its weight as it goes out, a weight that is not a number above 0 as 1, since a call sent anyway still spent it. `takeBack` removes the stamp of a call that never reached the host, matched on its time and its weight. `saveStamps` and `loadStamps` keep the stamps under a localStorage key the plugin names, per provider and per key fingerprint, and `ledgerPrint(plan, key)` gives the fingerprint, which is the same for every key on a keyless provider. A call of weight 1 is saved as its time and a heavier one as a time and weight pair. `keepStamps` lets go of what the plan's windows no longer see, and merges each hour that ended a day ago into one stamp, so a month window keeps a stamp an hour for the month plus one a call for the last day. `loadStamps` leaves out a saved weight above the plan's largest limit, and `readStamps` reads the stamps as they were saved, for a caller with its own rule for what to keep.
