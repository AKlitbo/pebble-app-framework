# The Settings Page

The framework builds a face's settings page from a short description of what the face shows. `buildConfig` lays out the standard sections in a fixed order, from the theme picker to the stock tickers, and a face with a layout of its own builds the page from the same sections and a few row helpers. Beside the plain controls it gives every face a location search for weather and second clocks, a hidden store for a component's scratch state, and a generator that bundles a face's own editor, such as a drag and drop grid, into one Clay component file. The page is built with Clay and runs in the phone app's web view.

The sections are in [`config-builder.ts`](../../src/ts/pkjs/config-builder.ts) and the row helpers in [`config-rows.ts`](../../src/ts/pkjs/config-rows.ts). The components are under `src/ts/clay/`, in [`location-component.ts`](../../src/ts/clay/location-component.ts) and [`hidden-store-component.ts`](../../src/ts/clay/hidden-store-component.ts), with the shared types in [`types.ts`](../../src/ts/clay/types.ts). The generator is [`generate-components.ts`](../../src/tools/clay-components/generate-components.ts) and its check is [`check-components.ts`](../../src/tools/clay-components/check-components.ts). [The Life of a Setting](life-of-a-setting.md), [The Phone Side](phone-side.md), and [Settings on the Watch](settings-on-the-watch.md) cover what happens once the wearer presses Save.

## Building the Page from Sections

A face describes its page and `buildConfig` returns the Clay config array, which the face hands to `startPebbleApp` as `clayConfig`:

```ts
import buildConfig from '../../paf/ts/pkjs/config-builder';

export default buildConfig({
  theme: {
    options: [
      { label: 'Night', value: 0 },
      { label: 'Day', value: 1 },
    ],
  },
  date: { beats: true },
  clock: { timeZone: true },
  location: {},
  weather: {},
  temperature: {},
  battery: {},
});
```

**Present Means Included.** Each field turns on a section or a control inside one, and its own fields tune it. A marker such as `weather: {}` needs nothing more. A field left out leaves its controls off the page.

**The Order.** A heading and an intro line open the page, and a **Save & Apply to Watch** button closes it. The default intro mentions the weather when the page has a Weather section, and `intro` replaces it. The phone checks every page it opens, the folded page and the one it falls back to alike, so a page that has lost its Weather section, such as on a face whose weather comes from a plugin alone and that shows no unit, opens on the plain wording. In between, the sections always come in this order:

| Section | Shown When | What It Offers |
| :-- | :-- | :-- |
| Appearance | `theme` or `quietTime` is passed, or `appearanceItems` holds at least one item | the theme picker when `theme` is passed, with a picture of each theme when `theme.previews` is given, the face's `appearanceItems`, and a Quiet Time icon toggle with `quietTime` |
| the face's own | `layoutSections` is passed | whatever the face builds, such as a layout editor |
| Bluetooth | always | the connection icon, and a buzz on connect and on disconnect |
| Clock | always | the date and time formats, the face's `clockItems`, a second clock's time zone with `clock.timeZone`, and the hourly buzz with `hourlyVibe` |
| Health | `steps` or `battery` | what the steps readout counts, and how the battery reads |
| Location Settings | `location` | phone GPS, a fallback, and a manual place |
| Weather | `weather`, `temperature`, or `wind` | the temperature unit, the wind speed unit with `wind`, and the provider with its key |
| Calendar Preferences | `calendar` | the iCal link, then the face's own `items` |
| Stock Preferences | `stocks` | the provider, its key, and the tickers, then the face's own `items`. A face built with `PLUGIN_STOCKS` gets Preferred Source in the provider select |

**Each Section Brings Its Keys.** Every message key a section uses has to be declared in the face's `pebble.appinfo.json`, and each one adds to the inbox the face sizes, as [Opening the Connection](talking-to-the-phone.md#opening-the-connection) covers. Bluetooth and Clock are always on the page, so their keys are always needed. An optional section that is left out brings no keys, which is why Health returns nothing at all, not even a heading, for a face that shows neither steps nor battery.

**The .beat Formats.** `date.beats` adds the .beat formats to the end of the date list. Their `{B}` marker is not a `strftime` token, and only `readout_date` swaps it for the time in .beats, so a face asks for them only when its date line runs through `readout_date`. [.beats](beats.md) covers the reading.

**Controls Clay Filters by Watch.** `steps.capabilities` is Clay's own filter, checked against the watch the page was opened from, so `['NOT_PLATFORM_GABBRO']` drops the steps control on a round watch and keeps it everywhere else. When steps is alone in the Health section, its heading takes the same filter, so a round watch never shows a section title with nothing under it.

**Selects Send Text.** A select's value comes from an HTML option, and an option's value is always text. So an option written as `{ label: 'Day', value: 1 }` comes back from the page as `"1"`, and Clay sends it to the watch that way. The watch reads a toggle or a choice the same whether it arrives as a number or as text holding only digits, so a select needs nothing set for the watch to read it. [Settings on the Watch](settings-on-the-watch.md#taking-values-from-the-phone) covers how the watch reads a choice, and `readChoice` reads a saved one on the phone, as [The Phone Side](phone-side.md#features) covers.

**The Stock Providers Are Written Out.** The Stock section lists its data sources by hand rather than reading them from the stock feature. The section builder is in every face's phone bundle, and importing the feature would carry the stock providers into faces that show no stocks.

**The Key Rows Hide for a Provider That Needs No Key.** The weather and stock API key rows carry a `visibleWhen` with `notIn` naming the providers that need no key, so the key box hides while Open-Meteo or Yahoo is picked. Any other choice shows it, a blank select included. The builder writes those lists out for the same reason, and a spec checks them against the providers table. A key row on a page whose picker narrows to one provider is settled against it, as [Offering Fewer Providers](#offering-fewer-providers) covers.

**The Wind Speed Unit.** `wind: {}` adds a Wind Speed Unit select on `WEATHER_WIND_UNIT`, with km/h, mph, knots, and m/s as 0 to 3 and km/h as the default. The watch reads it through `KNOWN_WIND_UNIT`, as [Describing the Settings](settings-on-the-watch.md#describing-the-settings) covers. A face that builds its own weather section offers the same choices with `WIND_UNIT_OPTIONS` from `config-rows.ts`.

## Laying Out a Page by Hand

`buildConfig` is the section builders in their usual order. Each one is exported on its own and takes the same description: `appearanceSection`, `bluetoothSection`, `clockSection`, `healthSection`, `locationSection`, `weatherSection`, `calendarSection`, and `stocksSection`. The optional ones return `null` when the description leaves them out. `appearanceSection` always returns its section, so a face with nothing for it gets the heading alone, and `hasAppearance` says whether to include it. A face whose page needs its own sections between the standard ones calls the builders it needs and puts them in its own order.

For the rows inside its own sections, [`config-rows.ts`](../../src/ts/pkjs/config-rows.ts) has `select`, `heading`, `subheading`, and `toggle`, plus `VIBE_OPTIONS`, the plain buzz picker whose values line up with the watch's own vibration choices:

```ts
import { bluetoothSection, clockSection } from '../../paf/ts/pkjs/config-builder';
import { heading, select, subheading, toggle, VIBE_OPTIONS } from '../../paf/ts/pkjs/config-rows';

const options = { hourlyVibe: {} };

export default [
  {
    type: 'section',
    items: [
      heading('Goals'),
      subheading('Steps'),
      select('GOAL_STEPS', 'Step Goal', [{ label: '5,000', value: 0 }, { label: '10,000', value: 1 }], 1),
      toggle('GOAL_BUZZ', 'Buzz at Goal', 'Buzz once when the goal is met.', true),
      select('GOAL_BUZZ_KIND', 'Goal Buzz', VIBE_OPTIONS, 1),
    ],
  },
  bluetoothSection(options),
  clockSection(options),
  { type: 'submit', defaultValue: 'Save & Apply to Watch' },
];
```

A hand-built page ends with its own submit button, since nothing adds one for it.

**The Page Is Read Whole.** The phone code walks every item on the page, nested sections included, for each setting's default and for every second clock, so a hand-built page gets the same treatment as one from `buildConfig`. [The Phone Side](phone-side.md) covers what it does with them.

**The Watch's Counts Come from Here.** `paf build` loads the page the same way and counts the choices each `select`, `radiogroup`, and `themePreview` with whole number values offers, as the highest value plus one. The watch holds each choice field to that count, through `KNOWN_THEME`, `KNOWN_HEADER_FONT`, and `SETTINGS_COUNT` in the face's own fields. Keep a choice's values whole numbers from 0 to 254 for the watch to count it. The build loads the page on a phone with no plugins and nothing saved, once for each platform, and takes the largest count, so offer the same whole number choices whatever the phone has installed or saved. [Counts from the Settings Page](settings-on-the-watch.md#counts-from-the-settings-page) covers the rules.

**So Do Its Defaults.** The build also writes the default each control opens with, which a fresh watch starts on, through every `KNOWN_*` entry and `SETTINGS_DEFAULT` in the face's own fields. Give a choice a default from its own options, and give every control on a key the same default on every platform, or the build stops. [Defaults from the Settings Page](settings-on-the-watch.md#defaults-from-the-settings-page) covers them.

**The Build Checks the Page.** Before it writes the header, the build stops on a page the watch or the phone would get wrong, with a line naming the face and the fix. A control whose `messageKey` the appinfo does not declare stops it, since Clay sends that setting under the key `undefined0`, which breaks every settings save. So does a `_REQUEST` key in `messageKeys` that no feature passed to `startPebbleApp` answers, since the watch would ask for it and wait forever. A small feature of the face's own answers a key of its own by returning `requests: ['ITS_REQUEST']` among its hooks. The build also stops on a `customClay` not written as a `function`, below.

## Custom Components

A Clay component is an object that Clay turns into one kind of row, with the parts [Clay's own guide](https://github.com/pebble-dev/clay#custom-components) describes. A face passes its own in `components`:

```ts
app.startPebbleApp({
  clayConfig,
  components: [gridEditor],
  features: [weather],
});
```

`startPebbleApp` registers them before the page is built. It also registers the location search for every face, and the theme picker and the hidden store for a page that holds one, so a page can use `locationsearch`, `themePreview`, and `hiddenStore` without listing them. A face that still lists the hidden store gets it once, and a face's own component named `hiddenStore` takes the place of the framework's.

**How Clay Builds a Row.** For each item in page order, Clay calls `initialize` with the row as `this`, so `this.$element` is the row's HTML and `this.config` is the page item, then sets the saved value and adds the row to the page. A row higher on the page is already there while a component initializes, and a row below it is not.

**One Key per Component.** Clay saves a component through its manipulator, as one value under the item's `messageKey`. A component that edits several settings keeps one of them as its own value and writes the rest into hidden stores, below.

### The Serialization Trap

Clay builds the page on the phone and opens it in the web view as one self-contained data URL. A registered component reaches that page as text: Clay writes each key, a colon, and the function's own `toString`.

```ts
const HINT = 'Pick a colour';

export default {
  name: 'swatchPicker',
  template: '<div class="component swatch"><input type="hidden" class="swatch-value" data-manipulator-target></div>',
  manipulator: 'val',

  // a function expression, which Clay copies as initialize:function () {
  // the shorthand initialize() { would be copied as initialize:initialize() { and stop the page parsing
  initialize: function (this: { $element: HTMLElement[]; config: { label?: string } }) {
    // HINT is undefined on the page, since only this body is copied
    // anything the component needs rides on its page item and is read from this.config
  },
};
```

**Shorthand Methods Break Every Row.** A method written as `initialize() {` stringifies with its name, and the copy comes out as `initialize:initialize() {`, which is not valid JavaScript. The page's script fails to parse, so every component on the page goes down with it and the settings screen never opens.

**Arrow Functions Lose the Row.** An arrow function parses, but it has no `this` of its own, so `this.$element` is undefined when Clay calls it.

**Nothing from the Module Comes Along.** Only the function bodies are copied, so an import or a module-level constant is undefined on the page and throws. Values go inline, and data the component needs rides on its page item, such as a list of panels with their icons and colours passed as `moduleOptions` and read from `this.config`. A type is fine, since TypeScript erases it before anything is copied.

**The Custom Function Too.** A face can pass Clay's custom function as `customClay`, which runs once on the page with the whole page as `this`, before any row is built. It is copied the same way and follows the same rules. Write it as a `function`, not an arrow, since Clay hands it the page as `this` and an arrow cannot take one. `paf build` stops on an arrow, a method, or anything that is not a function, naming the face. The phone still logs a warning for an arrow and stops on anything that is not a function, for a page built some other way. The framework's own page code, such as the show and hide for `visibleWhen` rows, runs first, and the face's `customClay` runs after it. When both run, each runs inside its own `try`, so an error one throws is logged with `console.error` and the other still runs.

### Scratch State in a Hidden Store

The web view gives the page no `localStorage` of its own, so a component cannot remember anything there between visits. The `hiddenStore` component is a hidden input on Clay's `val` manipulator. It shows nothing, and Clay saves its value with the other settings and hands it back the next time the page opens. The framework registers it for any page with a `hiddenStore` row, so the face does not list it in `components`.

```ts
{ type: 'hiddenStore', messageKey: 'GRID_LIBRARY', storeClass: 'grid-library', defaultValue: '' },
{ type: 'gridEditor', messageKey: 'GRID', defaultValue: '1,0,0,2,2' },
```

**What a Store Holds.** A store holds scratch state the watch never reads, such as a library of saved layouts the editor lets the wearer switch between. It also carries the extra settings of a component that edits more than one, which the watch reads as ordinary settings.

**Finding a Store.** Every store carries the `pf-hidden-store` class, so a page with more than one gives each a `storeClass` as well, and the component finds its store by that class. A plain lookup on `pf-hidden-store` would keep finding the first one.

**Stores Go above the Component.** A row below a component is not on the page yet when the component initializes, so a store declared after its editor is not there to be read. Declare the stores first. An editor can also read its stores again once the page has finished building.

**A Store Costs Message Room.** A store is a message key like any other. It has to be declared, and Clay sends it to the watch on every save even when the watch never reads it, so a large library adds to the size the watch's inbox needs. [Opening the Connection](talking-to-the-phone.md#opening-the-connection) covers sizing the inbox for the whole page.

### Colouring the Framework's Own Rows

The location search, the plugin notes, and the supported plugins panel draw in Clay's own colours: a white list with orange for a pressed row, a link, and the focus ring. A face whose page uses other colours sets these custom properties on `:root` from its own component CSS, and the framework's rows take them up:

```css
:root {
  --pf-accent: #ff6a1f;       /* a pressed row, a link, and the focus ring */
  --pf-on-accent: #1a0c03;    /* text on the accent */
  --pf-surface: #171a1f;      /* the search list's fill */
  --pf-ink: #eceef2;          /* the search list's text */
  --pf-line: #3d434d;         /* the search list's edges */
  --pf-note-accent: #ff6a1f;  /* a warning note's edge, tint, and badge */
}
```

Each one left out keeps Clay's colour, so a face that sets none looks as Clay draws it. None of them changes a size. `--pf-note-info-accent` sets the grey of a calm note and of the panel. [`control-style.ts`](../../src/ts/clay/control-style.ts) holds the rules the framework's components share, and [`callout-style.ts`](../../src/ts/clay/callout-style.ts) holds the notes'.

**The Class Names.** The framework's own classes on the page start with `pf-`, so they keep clear of a face's own.

| Component | Root Class | Part Prefix |
| :-- | :-- | :-- |
| The location search | `pf-loc-search` | `pf-loc-` |
| The theme picker | `pf-theme` | `pf-theme-` |
| The hidden store | `pf-hidden-store` | none |
| The plugin notes | `pf-note` | `pf-note-` |
| The plugins panel | `pf-plugins` | `pf-plugins-` |

A face that restyles one of these rows beyond its colours writes its selectors against those names, such as `.pf-loc-search .pf-loc-note` for the location search's note.

### Rows Keep Their Padding in Either Order

Several of Clay's components take padding off their row in a card and let the label and the description inside carry it. A select, a text box, a toggle, a slider, and a colour picker take all of it, a radio group and a checkbox group take half the right side, and a button takes the bottom. Clay's base sheet pads every row in a card with a rule of the same weight, so whichever sheet comes later wins. Clay adds each component's style after its base sheet, but the Pebble Android app with plugins on runs a script at the very start of the page that makes a head of its own, so every component's style lands ahead of the base sheet. Those rows would then get a second gap under or beside them. `startPebbleApp` registers a component named `pafPageStyle` on every page to stop that, so a face cannot use that name for a component of its own. No row draws it, and its style repeats each of Clay's row rules at `.section > .component.component-X`. The extra class makes Clay's padding win in either order, and in the usual order the rules set what Clay's own rules already set. They are in [`page-style-component.ts`](../../src/ts/clay/page-style-component.ts).

**Rows That Borrow a Clay Class.** The location search borrows the class of Clay's text box, and the theme picker borrows the class of Clay's select. The framework brings Clay's own text box and select with them, as [The Location Search](#the-location-search) and [The Theme Picker with Pictures](#the-theme-picker-with-pictures) cover, so Clay's own padding is always there for them. A face's own component that borrows one of Clay's row classes on a page with no row of Clay's own of that kind gets no style from Clay, so the rules here take the base sheet's gap off it and it sits as that row does on every other page.

**A Face's Own Padding.** A face rule that sets the padding of one of these rows at Clay's weight, such as `.section .component-select`, loses to the framework's. Write it at `.section > .component.component-select` or higher. The framework registers its component ahead of the face's components, so a face rule of the same weight still wins. On a page where a feature's `page` hook adds the location search or the theme picker, Clay's text box or select style for it comes after the face's components.

## The Location Search

`locationsearch` is a search box that finds places as the wearer types. After two characters and a short pause it asks Open-Meteo's free geocoder for five matches. Picking one saves the place as JSON, with its coordinates, its label, and its time zone:

```
{"lat":51.5,"lon":-0.13,"label":"London, England, United Kingdom","offset":60,"tz":"Europe/London"}
```

Typing clears the saved place, so a name typed but never picked from the list saves as nothing, and a note under the box says so. The search drops a geocoder answer that lands after a newer query, so a slow reply cannot replace the list for what the wearer has typed since.

**Its Look.** The search draws Clay's text box markup and takes its look from the text box's style, with the label over a dark rounded field. Clay adds a component's style only to a page that registers the component, and registers its own only for the rows on the page it was built with. So `createClay` registers Clay's own text box on any page holding a `locationsearch` and no text box, and `prepareSettingsPage` does the same for a page a feature's `page` hook adds the search to, then takes it off again on a later open whose page has no search. The phone, `clay-preview`, and the build's own page load all build the page through those two. A face that passes its own `input` component keeps it, and the search draws with that one.

**The Site It Reaches.** The search runs inside the settings page, and on Android with plugins on the Pebble app holds that page to the sites the face lists in `usesPermissions`. So the manifest build lists `open-meteo.com` for any face that declares `LOCATION_NAME` or a `CLOCK_TIMEZONE_` key such as `CLOCK_TIMEZONE_1`, whether or not it fetches weather. A hand-built page that puts a `locationsearch` under another key adds `open-meteo.com` to its own `usesPermissions`, as [What the Phone Lets It Reach](phone-side.md#what-the-phone-lets-it-reach) shows.

**GPS and the Manual Place.** The Location Settings section puts **Enable Phone GPS** and **Fallback to Manual Location** beside the search. GPS starts off unless the face passes `location: { gpsDefault: true }`, and the fallback starts on. [Where the Location Comes From](fetching-the-weather.md#where-the-location-comes-from) covers how a fetch picks between them.

**A Second Clock.** An item marked `timeZone: true` becomes a time zone picker, which `clock: { timeZone: true }` adds to the Clock section. A hand-built page can mark any `locationsearch` item the same way, and the phone keeps each marked item's offset current. [Picking a Place](time-zones.md#picking-a-place) covers what the picker offers and how the saved zone becomes the offset the watch is sent.

## The Theme Picker with Pictures

The theme picker is a dropdown by default. A face can give it a picture of each theme by passing `previews` in the `theme` section, a map from a theme's option value to a list of data URLs. The picker then keeps the dropdown and draws the chosen theme's pictures under it. A theme with a day and a night shot gets both side by side:

```ts
import themePreviews from './clay/theme-previews.g';

buildConfig({
  theme: {
    label: 'Theme',
    options: [{ label: 'Day', value: 0 }, { label: 'Night', value: 1 }],
    previews: themePreviews,
  },
});
```

A theme's value can instead carry a set of pictures per platform, so a face built for more than one watch shows each watch its own shots. The picker reads the watch the page was opened from and draws that platform's set. A shot from a round watch is masked to the circle the screen shows, since a round watch's screenshot is a square framebuffer with the corners outside the circle. A flat value names no platform, so its shape is unknown and it is left square. The map lives in the manifest, so a face's `config.ts` passes `previews` the same way either way.

The pictures come from the `thumbnails` plugin's `theme-previews` generator, which base64-encodes a face's screenshots into the `theme-previews.g.js` the `previews` import reads. [The Thumbnails Plugin](thumbnails-plugin.md#theme-previews) covers the manifest, the per-platform map, and the generator.

The picker saves under `APPEARANCE_THEME` exactly as the plain select, so nothing on the watch changes. The framework registers its `themePreview` component only when a page holds one, so a face that passes no `previews` carries none of its code. On a hand-built page, an item of `type: 'themePreview'` with `options` and `previews` builds the same picker. It borrows the dropdown's look from Clay's own select styling, which Clay only adds to a page that registers Clay's select. So `createClay` registers Clay's own select on any page holding a `themePreview` and no select, and `prepareSettingsPage` does the same for a page a feature's `page` hook adds a picker to, then takes it off again on a later open whose page has none. A face that passes its own `select` component keeps it.

A hand-built `themePreview` item can also set `previewsByKey`, the `messageKey` of another control on the page. Its `previews` then nest, keyed first by that control's value and then by the option's value, so the shots under the picker follow a second choice elsewhere on the page, such as a scene or a mode. The picker still owns `APPEARANCE_THEME` on its own, so the value saves the usual way. Clay lists the page's controls only once the page is built, so the picker reads the named control then and redraws the preview whenever it changes.

## Showing Rows Only When They Apply

A row that does nothing under the current choice can be hidden rather than left on the page looking live. Give it a `visibleWhen`, naming a control and the values of that control which reveal the row:

```ts
{
  type: 'select',
  messageKey: 'REFRESH_EVERY',
  label: 'Refresh Every',
  options: [ /* ... */ ],
  visibleWhen: { key: 'DATA_SOURCE', in: ['live'] },
}
```

`key` is the controlling item's messageKey, and `in` is the list of its values that show this row. A select's values match as written, and a toggle's are `true` and `false`.

**Values That Hide a Row.** `notIn` in place of `in` lists the values that hide the row, and any other value shows it. That includes a blank select, which is what a saved choice the select no longer offers leaves. The builder's key rows use it, so a key box hides for a provider known to need no key and shows for anything else:

```ts
visibleWhen: { key: 'WEATHER_PROVIDER', notIn: ['openmeteo'] },
```

**More Than One Condition.** Pass a list instead of a single condition, and the row shows only when every one of them holds. This is how a row depends on both a mode and a switch inside it:

```ts
visibleWhen: [
  { key: 'MODE', in: ['advanced'] },
  { key: 'USE_CUSTOM', in: [true] },
]
```

**How It Works.** When a page has any `visibleWhen` row, the framework runs its own custom function to show and hide the rows, once as the page opens and again whenever a named control changes. A hidden row keeps its saved value, so a control turning a section back on brings the earlier choices back. This runs before a face's own `customClay`, so `visibleWhen` works on every face, and a face's function can still change a row after it. The rows ride on the page as plain config, so a hand-built page uses `visibleWhen` the same way.

Put `visibleWhen` on a control, not a `section`, since Clay gives a section no row to hide. A row whose named control is dropped from a watch by its own `capabilities` is hidden along with it on that watch, since the value it waits on is not there to read.

**A Section Whose Rows All Hide.** Clay draws a section as a card, and a card whose rows are all hidden stays on the page empty. Mark the section `hideWhenEmpty: true`, and the show and hide hides the card while every row in it is hidden and shows it again once one shows. It finds the card through a row inside it that has a message key, so a section holding only text rows is left as Clay drew it.

## Rows a Plugin Choice Acts On

`buildConfig` marks some of its rows on every face: the weather's and the stocks' Data Source selects, the rows only a weather fetch, a stock provider, or an iCal link needs, and the weather's lead line. Clay ignores the marks, so they change nothing on a face built without a plugin define. On a face built with `PLUGIN_WEATHER`, `PLUGIN_STOCKS`, or `PLUGIN_CALENDAR`, the feature's `page` hook reads them as the page opens. It adds **Pebble App: Preferred Source** to the marked select, hides the marked rows while it is picked, and adds the notes that go with it.

A face that builds its own weather, stock, or calendar section marks its own rows the same way, with `pluginSourceHides` on a row that means nothing while the plugin is picked, and `pluginSourceLead` on its own line about choosing a provider. A face with now playing or the phone's battery can mark the row it wants their notes under with `pluginSourceRows`. [Marks on the Page](plugin-sources.md#marks-on-the-page) lists each mark and the `page` hook behind them.

## Offering Fewer Providers

A face that lists `providers` in its appinfo, as [The Phone Side](phone-side.md#what-the-phone-lets-it-reach) covers, gets its settings page narrowed to that list. The build writes the lists into the phone bundle, and the phone narrows the page before anything reads it, so Clay, the defaults, and the settings restore all see the narrowed page. A face that lists none keeps exactly the page it has.

**Found by Key.** The rows are found by their message keys, not by a mark: `WEATHER_PROVIDER` and `WEATHER_API_KEY` for weather, `STOCK_PROVIDER` and `STOCK_API_KEY` for stocks, and `CALENDAR_ICS_URL` for the calendar. The features read the saved provider by those keys whatever row wrote it, so a face's own sections narrow the same way as the builder's, with nothing for the face to add. A row with the provider key that carries `options` counts as the picker, so a `radiogroup` narrows like a `select`. A row with the key and no options is left as it is, with a console warning.

**A List of Custom Providers.** The picker keeps only the listed providers, in its own order and with its own labels. The order of the custom providers in the list sets the default, which is the first one listed, and `plugin` can sit anywhere without changing it. A face whose picker defaults to a provider the list leaves out gets a console warning saying to list it first. A listed provider the picker has no option for gets a warning too, since the page cannot offer it. The API key row goes when no listed provider needs a key. A picker left with one provider goes when the page opens, along with a lead line marked `pluginSourceLead` for it, and a section left holding only headings goes with them, such as a Weather section with no temperature unit. A `visibleWhen` naming the picker is settled against that one provider. A condition that holds comes off, so its row shows, and one that fails stays, so its row stays hidden.

**The Plugin Alone.** A list of `["plugin"]` takes the picker off the page, with every row only a custom provider needs: the API key row, the iCal link, the rows marked `pluginSourceHides` for the picker, and the lead line marked `pluginSourceLead`, so a face's own line about choosing a provider takes that mark. A section left with only headings goes with them. Where the picker or the iCal link sat, the plugin source page puts its notes: where the data comes from, and while no plugin on the phone serves the kind, how to turn plugins on in the Pebble app. With plugins off, the supported plugins panel says that, so no note goes there, and a section that held only the picker under its heading goes too. A row the face did not mark stays, such as a second clock in the Location Settings section.

**The Plugin and Custom Providers.** A list such as `["plugin", "openmeteo"]` narrows the picker to the custom providers, and the plugin source page adds Preferred Source when a plugin on the phone serves the kind. With plugins off, or when nothing on the phone serves the kind, the picker is left with one provider and goes with its lead line, so the face fetches from that provider. A section the two leave holding only headings goes with them.

**The Saved Setting Follows.** A saved provider the face no longer offers reads as the default, and so does a listed one the face's own picker has no option for. The phone rewrites it in the saved settings at launch, and again in every settings restore before it saves, so the picker never shows a blank and the face never fetches from a site the manifest dropped. A saved `plugin` stays only while the list holds it. The saved value of every row the page took away is deleted with it, such as an API key row, or a plugin only kind's provider, key, location, and iCal link, so the first save from the page changes nothing the features watch. The phone writes the saved settings only when that changed them, and never on a phone with no saved settings, which it fills from the watch instead. When a restore brings back a value the phone then changes, the phone sends the watch its settings the way a restore does, so the watch stops echoing the old value. A change at launch reaches the watch the same way, once its settings reply shows it kept its own settings, since the watch still holds what it was last sent. A wiped watch gets it inside the restore. The default is the first listed custom provider the face's picker offers.

**The Stock Cache Follows Too.** When the stock provider the face really uses moves, the saved one or else the default, the phone empties the stock cache unless the new provider saved it, so the new provider never reads the old one's quotes as its own. The stock feature also checks the cache's provider on every round, which covers a restore that moves the provider after the cache was loaded.

## A Face's Own Builder

An editor too big for one hand-written component, such as a drag and drop grid with presets and an import panel, is written as small TypeScript pieces and bundled into a component. The pieces are plain modules, so Vitest tests them like any other code, and the generator turns them into the one self-contained file Clay can copy.

A face keeps its pieces under `src/pkjs/clay/builder/`, and a family keeps the ones its faces share under `core/pkjs/clay/builder/`. A manifest beside them names the component, its template and stylesheets, the pieces to bundle, and where the finished `*.g.js` lands in the face. One piece, `init`, hangs the hooks on the row that the generated manipulator calls. `paf gen <face> clay` bundles the pieces with esbuild into one function that becomes the component's `initialize`, and parses the finished file once before it writes it, so a file that does not parse never lands.

**Where a Piece Comes From.** A piece is looked up in the face first, then in its family's core, then in the framework's `src/ts/clay/builder/`, by the same path under each. A face's copy wins even when a shared piece is the one importing it. So one manifest in a family's core can build a different editor for each face: the drag handling and the popup panels come from the framework, and each face supplies its own grid geometry, the code that reads and writes its layout string, its starter layouts, and its template. Manifests shadow each other the same way, by file name.

**Committed, and Checked.** The build never runs the generator. It compiles the face's phone code, leaves the builder pieces out of the compile so they do not ship a second time as loose modules, and copies every committed `*.g.js` beside the result. The committed file is therefore all the page ever sees, and a piece edited without a fresh `paf gen` ships the old editor. `paf check` builds every component again in memory, compares it with the committed file, and reports a stale one with the `paf gen` line that fixes it. It also reports a committed component no manifest writes any more, since the build would still copy it into the face.

## Previewing the Page

The `dev` plugin's `clay-preview` tool builds a face's real page into an HTML file a browser opens, as [Previewing the Settings Page](dev-plugin.md#previewing-the-settings-page) covers.
