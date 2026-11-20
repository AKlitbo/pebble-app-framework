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
| Weather | `weather`, `temperature`, or `wind` | the temperature unit, the wind speed unit with `wind`, and the provider with its key |
| Location Settings | `location` | phone GPS, a fallback, and a manual place |
| Calendar Preferences | `calendar` | the iCal link, then the face's own `items` |
| Stock Preferences | `stocks` | the provider, its key, and the tickers, then the face's own `items`. A face built with `PLUGIN_STOCKS` gets Preferred Source in the provider select |
| Health | `steps`, `battery`, or `goals` | what the steps readout counts, how the battery reads, and the daily goals with the goal buzz |

The sources that need setting up come ahead of Health, whose defaults work untouched. Location Settings sits straight under Weather, so picking a weather plugin folds it away just below the select that hides it.

**Each Section Brings Its Keys.** Every message key a section uses has to be declared in the face's `pebble.appinfo.json`, and each one adds to the inbox the face sizes, as [Opening the Connection](talking-to-the-phone.md#opening-the-connection) covers. Bluetooth and Clock are always on the page, so their keys are always needed. An optional section that is left out brings no keys, which is why Health returns nothing at all, not even a heading, for a face that shows neither steps nor battery.

**The .beat Formats.** `date.beats` adds the .beat formats to the end of the date list. Their `{B}` marker is not a `strftime` token, and only `readout_date` swaps it for the time in .beats, so a face asks for them only when its date line runs through `readout_date`. [.beats](beats.md) covers the reading.

**Controls Clay Filters by Watch.** `steps.capabilities` is Clay's own filter, checked against the watch the page was opened from, so `['NOT_PLATFORM_GABBRO']` drops the steps control on a round watch and keeps it everywhere else. When steps is alone in the Health section, its heading takes the same filter, so a round watch never shows a section title with nothing under it.

**Selects Send Text.** A select's value comes from an HTML option, and an option's value is always text. So an option written as `{ label: 'Day', value: 1 }` comes back from the page as `"1"`, and Clay sends it to the watch that way. The watch reads a toggle or a choice the same whether it arrives as a number or as text holding only digits, so a select needs nothing set for the watch to read it. [Settings on the Watch](settings-on-the-watch.md#taking-values-from-the-phone) covers how the watch reads a choice, and `readChoice` reads a saved one on the phone, as [The Phone Side](phone-side.md#features) covers.

**The Stock Providers Are Written Out.** The Stock section lists its data sources by hand rather than reading them from the stock feature. The section builder is in every face's phone bundle, and importing the feature would carry the stock providers into faces that show no stocks.

**The Key Rows Hide for a Provider That Needs No Key.** The weather and stock API key rows carry a `visibleWhen` with `notIn` naming the providers that need no key, so the key box hides while Open-Meteo or Yahoo is picked. Any other choice shows it, a blank select included. The builder writes those lists out for the same reason, and a spec checks them against the providers table. A key row on a page whose picker narrows to one provider is settled against it, as [Offering Fewer Providers](#offering-fewer-providers) covers.

**A Key for Each Provider.** One key row serves every provider of its select, so the phone keeps a key for each provider, for the weather and stocks alike. When the wearer changes the Data Source, the key row shows the key saved for the new provider, or goes blank for a provider with none, and a save keeps the row's value as the picked provider's key. `WEATHER_API_KEY` and `STOCK_API_KEY` still carry the picked provider's key to the phone code and the watch, so the features and the face read it as before, and a face declares no new key. A phone that saved one key before keeps it as the key of the provider saved beside it. This holds for any page with `WEATHER_PROVIDER` and `WEATHER_API_KEY`, or `STOCK_PROVIDER` and `STOCK_API_KEY`, on it, the builder's sections or a face's own. [`provider-keys.ts`](../../src/ts/pkjs/provider-keys.ts) is the phone side and [`provider-keys-fn.ts`](../../src/ts/clay/provider-keys-fn.ts) the page code.

* **Where the Keys Live.** The phone keeps them in its own `localStorage` under `pf-provider-keys`, beside Clay's settings rather than inside them, since a save and a settings restore from the watch each rewrite Clay's settings whole.
* **How the Page Gets Them.** Each time the page opens, the phone writes each key row's keys onto it as `providerKeys`, and the page code swaps the row as the select changes.
* **Whose Key the Row Holds.** The phone records which provider the saved key row belongs to at every save and restore, and at launch for a key row saved with no owner on record, as the provider saved beside it or the default when the select was never saved. When a face's `providers` list drops the provider picked, or moves its first provider under a select the wearer never saved, as on a page that offered one provider and so had no select, the phone files the row under the provider it belonged to, and the row takes the new provider's own key, or comes out of the saved settings when it has none. A default that moves to a provider taking no key and back again gets its key back the same way. So the feature never asks one provider with another's key. A settings restore from the watch files the key too, under the provider the watch sends with it.
* **A Provider That Takes No Key.** The phone never files a key under a provider the row hides for, read off the row's own `visibleWhen` on the select exactly as the page's show and hide reads it, nor under the plugin choice or a blank select. A key left on the row there is kept apart and goes to the first provider the wearer picks that needs a key and has none. A blank select, as from a saved provider the select does not offer, shows the key of the provider the row belongs to and never hands it to another. With no such provider on record it shows the key kept apart, so a save that touches nothing keeps it and emptying the row clears it.
* **A Key Row That Goes.** A `providers` list that takes the key row off the page, such as Yahoo alone, lets go of the keys kept for that select, so nothing stays on the phone that the page can no longer change. A face with no list that takes its key row off keeps the keys, and a save leaves them as they were, so a later release that brings the row back finds them.
* **How a Save Brings Them Back.** Clay only saves rows with a message key and seals its own methods, so the phone adds a hidden store on `PF_PROVIDER_KEYS` at the foot of the page, and the page code keeps every provider's key in it. The phone takes it out of the save before Clay reads it, since Clay would send it to the watch under a key the face never declared. The build leaves the store out of the controls it counts, so it needs no place in `messageKeys`. `PF_PROVIDER_KEYS` and `pf-provider-keys` are reserved, and a face's `customClay` sees the store in `getAllItems`.

**The Daily Goals.** `goals: {}` adds the goal rows to the Health section, under the steps and battery rows, as [Daily Goals on the Page](#daily-goals-on-the-page) lists them. `goals.heartRate` adds the Heart Rate Limit, with its own `description` and `capabilities`. The Distance Unit and the Goal Alerts are on unless `goals.distanceUnit` or `goals.alerts` is `false`, and each takes its own `description`. A face that keeps the Distance Unit declares `HEALTH_DISTANCE_UNIT` and places `KNOWN_DISTANCE_UNIT`, and one that keeps the Goal Alerts declares `HEALTH_GOAL_VIBE` and places `KNOWN_GOAL_VIBE`. `goals.alerts.vibePicks` adds the face's own picks, and `goals.alerts.custom` adds Custom, which also needs `HEALTH_GOAL_VIBE_CUSTOM` and `KNOWN_GOAL_VIBE_CUSTOM`.

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

### Daily Goals on the Page

[`goal-rows.ts`](../../src/ts/pkjs/goal-rows.ts) builds the rows for the daily movement goals and the buzz when one is met, which the watch reads through the `KNOWN_GOAL_*` entries in [Daily Goals](settings-on-the-watch.md#daily-goals). `goalRows` lays them out in their usual order, and each row is its own piece, so a face can put rows of its own between them:

| Piece | Rows | Message Key |
| :-- | :-- | :-- |
| `activityHeading` | the Activity subheading | |
| `stepGoalRow` | Step Goal, opening on 10,000 | `HEALTH_GOAL_STEPS` |
| `distanceGoalRow` | Distance Goal, opening on 5 km | `HEALTH_GOAL_DISTANCE` |
| `distanceUnitRow` | Distance Unit, kilometres or miles | `HEALTH_DISTANCE_UNIT` |
| `calorieGoalRow` | Calorie Goal, opening on 2000 kcal | `HEALTH_GOAL_CALORIES` |
| `activityGoalRow` | Activity Goal, opening on 30 min | `HEALTH_GOAL_ACTIVE` |
| `sleepHeading` | the Sleep subheading | |
| `sleepGoalRow` | Sleep Goal, opening on 8 h | `HEALTH_GOAL_SLEEP` |
| `heartHeading` | the Heart subheading | |
| `heartRateLimitRow` | Heart Rate Limit, opening on 180 bpm | `HEALTH_GOAL_HR` |
| `goalAlertRows` | the Goal Alerts subheading, Goal Met Vibration opening on None, and with `custom` the Custom Vibration Pattern | `HEALTH_GOAL_VIBE`, and `HEALTH_GOAL_VIBE_CUSTOM` with `custom` |

```ts
import { heading } from '../../paf/ts/pkjs/config-rows';
import { goalAlertRows, stepGoalRow, distanceGoalRow, distanceUnitRow } from '../../paf/ts/pkjs/goal-rows';

const health = {
  type: 'section',
  items: [heading('Health'), stepGoalRow(), distanceGoalRow(), distanceUnitRow(), ...goalAlertRows()],
};
```

**What a Face Can Change.** The keys, labels, defaults, and options are fixed, since the watch's tables and a wearer's saved choices depend on them. Three rows take a help line of the face's own, since only the face knows which panels it shows:

* `heartRateLimitRow` takes a `description`, and has none otherwise. It also takes `capabilities`, such as `['NOT_PLATFORM_GABBRO']` for a watch with no heart rate sensor, and `heartHeading` takes the same `capabilities`, so the heading goes with the row.
* `distanceUnitRow` takes a `description`, and has none otherwise.
* `goalAlertRows` takes a `description` for the Goal Met Vibration. Without one it says the watch buzzes the first time each day the wearer reaches a goal. It also takes the face's own `vibePicks` and `custom`, below.

`goalRows` takes the same options as `heartRate`, `distanceUnit`, and `alerts`. It leaves the Heart rows out without `heartRate`, and leaves the Distance Unit or the Goal Alerts out when `distanceUnit` or `alerts` is `false`, for a face that shows goal bars with no buzz or no unit.

**The Goal Met Vibration Is Text.** Its values are what the watch plays, so the page carries the tunes and the watch carries none. Every page offers None, Short, Long, and Double, as empty text and `S`, `L`, and `D`, which are `GOAL_VIBE_OPTIONS`.

* **The Face's Own Picks.** `vibePicks` adds picks after Double, each valued as a comma list of milliseconds starting on a buzz, such as `{ label: 'Fanfare', value: '50,50,250,150,600' }`. The build stops on a pick longer than the 63 characters the watch keeps, and on one that is not a list of up to 40 whole milliseconds from 10 to 10000 with no spaces, since the watch would play it cut short or as a rhythm nobody wrote. The build holds any face's own select on `HEALTH_GOAL_VIBE` to the same rules, and stops on one offering Custom, `C`, on a page with no `HEALTH_GOAL_VIBE_CUSTOM` row, since the pick would stay quiet.
* **Custom.** `custom: true` adds Custom as the last pick, valued `C`, and the Custom Vibration Pattern box under the select, which only shows while Custom is picked and takes 120 characters. Without it the page has neither, and the face needs no `HEALTH_GOAL_VIBE_CUSTOM`.

**The Tables.** `GOAL_STEPS`, `GOAL_DISTANCES`, `GOAL_CALORIES`, `GOAL_ACTIVE_MINUTES`, `GOAL_SLEEP_HOURS`, and `GOAL_HR_LIMITS` hold the goals each select offers, in menu order. Each select sends the index, and a spec checks every list against the watch's table in `goals.c`, length and order. The step labels are written in the phone's own number format.

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

**The Custom Function Too.** A face can pass Clay's custom function as `customClay`, which runs once on the page with the whole page as `this`, before any row is built. It is copied the same way and follows the same rules. Write it as a `function`, not an arrow, since Clay hands it the page as `this` and an arrow cannot take one. `paf build` stops on an arrow, a method, or anything that is not a function, naming the face. The phone still logs a warning for an arrow and stops on anything that is not a function, for a page built some other way. The framework's own page code, such as the show and hide for `visibleWhen` rows and the plugin sources a builder's warnings read, runs first, and the face's `customClay` runs after it. When both run, each runs inside its own `try`, so an error one throws is logged with `console.error` and the other still runs.

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

### A Line Under Save

A text row whose markup carries the `pf-footer` class is centred, for a credit or a note under the Save button, as in `{ type: 'text', defaultValue: '<div class="pf-footer">Weather data by Open-Meteo.</div>' }`. The rule rides on the same `pafPageStyle` component, so every page carries it, a plugin app's included, with no style of the page's own. It sits at `.component-text .pf-footer`, a class more than Clay's own text rules, so it holds in either order.

## The Location Search

`locationsearch` is a search box that finds places as the wearer types. After two characters and a short pause it asks Open-Meteo's free geocoder for five matches. Picking one saves the place as JSON, with its coordinates, its label, and its time zone:

```
{"lat":51.5,"lon":-0.13,"label":"London, England, United Kingdom","offset":60,"tz":"Europe/London"}
```

Typing clears the saved place, so a name typed but never picked from the list saves as nothing, and a note under the box says so. The search drops a geocoder answer that lands after a newer query, so a slow reply cannot replace the list for what the wearer has typed since. Each pick fires the row's Clay `change` event, so a face's page code can read the pick with the row's `get` as it lands. On a field marked `timeZone: true`, a place pick also asks `api.open-meteo.com` for the place's zone and fires `change` again when that lookup writes it. A field that takes no zone makes no lookup, since nothing reads its zone, so its pick fires once. Typing that clears a pick fires it too. Page code on a timezone field that fills a row from the pick, such as a name, fills it only when the place itself changes, so the second `change` never writes over what the wearer typed.

**Its Look.** The search draws Clay's text box markup and takes its look from the text box's style, with the label over a dark rounded field. Clay adds a component's style only to a page that registers the component, and registers its own only for the rows on the page it was built with. So `createClay` registers Clay's own text box on any page holding a `locationsearch` and no text box, and `prepareSettingsPage` does the same for a page a feature's `page` hook adds the search to, then takes it off again on a later open whose page has no search. The phone, `clay-preview`, and the build's own page load all build the page through those two. A face that passes its own `input` component keeps it, and the search draws with that one. A plugin app's page that passes the search gets Clay's text box the same way, as [Plugin Apps](plugin-apps.md#the-settings-page) covers.

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

A theme's value can instead carry a set of pictures per platform, so a face built for more than one watch shows each watch its own shots. The picker reads the watch the page was opened from and draws that platform's set. Only that platform's set reaches the page, since the framework cuts the others out as the page opens. A shot from a round watch is masked to the circle the screen shows, since a round watch's screenshot is a square framebuffer with the corners outside the circle. A flat value names no platform, so its shape is unknown and it is left square. The map lives in the manifest, so a face's `config.ts` passes `previews` the same way either way.

The pictures come from the `thumbnails` plugin's `theme-previews` generator, which base64-encodes a face's screenshots into the `theme-previews.g.js` the `previews` import reads. [The Thumbnails Plugin](thumbnails-plugin.md#theme-previews) covers the manifest, the per-platform map, and the generator.

`previews` can also be a function that hands the map back, such as `() => require('./clay/theme-previews.g')`. The framework calls it each time the settings page opens, so the pictures load only then rather than every time the phone code starts. `faceStart` takes the function off the page before anything builds Clay and keeps it by the picker's `messageKey`, since Clay rebuilds every function on its page from the function's text and the require would not survive that. Each open calls the function again and cuts the result to the watch in Clay's meta, the same field the picker reads. Clay fills that when the phone code becomes ready, so a watch swapped while the phone code stays up keeps the earlier watch's shots until it next starts. A plugin app's page goes the same way, and with no watch behind it each theme keeps the one list the picker draws.

The picker saves under `APPEARANCE_THEME` exactly as the plain select, so nothing on the watch changes. The framework registers its `themePreview` component only when a page holds one, so a face that passes no `previews` carries none of its code. On a hand-built page, an item of `type: 'themePreview'` with `options` and `previews` builds the same picker. It borrows the dropdown's look from Clay's own select styling, which Clay only adds to a page that registers Clay's select. So `createClay` registers Clay's own select on any page holding a `themePreview` and no select, and `prepareSettingsPage` does the same for a page a feature's `page` hook adds a picker to, then takes it off again on a later open whose page has none. A face that passes its own `select` component keeps it.

A hand-built `themePreview` item can also set `previewsByKey`, the `messageKey` of another control on the page. Its `previews` then nest, keyed first by that control's value and then by the option's value, so the shots under the picker follow a second choice elsewhere on the page, such as a scene or a mode. The picker still owns `APPEARANCE_THEME` on its own, so the value saves the usual way. Clay lists the page's controls only once the page is built, so the picker reads the named control then and redraws the preview whenever it changes.

Each `themePreview` item on a page takes a map of its own. The manifest names a map for each picker beyond the theme one, and one nested for a picker with `previewsByKey`, and the generator writes each to its own `theme-previews-<name>.g.js` for the face to import. [More than One Picker](thumbnails-plugin.md#theme-previews) covers the manifest's `maps` and `mapsByKey`.

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

**Where a Piece Comes From.** A piece is looked up in the face first, then in its family's core, then in the framework's `src/ts/clay/builder/`, by the same path under each. A face's copy wins even when a shared piece is the one importing it. So one manifest in a family's core can build a different editor for each face: the drag handling, the palette, the plugin warnings, and the popup panels come from the framework, and each face supplies its own grid geometry, the code that reads and writes its layout string, its starter layouts, and its template. Manifests shadow each other the same way, by file name.

**Committed, and Checked.** The build never runs the generator. It compiles the face's phone code, leaves the builder pieces out of the compile so they do not ship a second time as loose modules, and copies every committed `*.g.js` beside the result. The committed file is therefore all the page ever sees, and a piece edited without a fresh `paf gen` ships the old editor. `paf check` builds every component again in memory, compares it with the committed file, and reports a stale one with the `paf gen` line that fixes it. It also reports a committed component no manifest writes any more, since the build would still copy it into the face.

### The Palette

The `ts/shared/palette` piece draws the palette a builder's panels are dragged from: a tab for each panel size, a row of group tabs under it, the panel tiles, and a status line naming the group on show and how many panels it leaves out, with a Show All button beside it. Each size opens on its first group rather than on every panel, so the list stays short and no panel is a long drag from the watch. The group picked on a size is kept while the page is open. A size with one group shows no group row, and a size no panel comes in gets no tab.

```ts
// in the face's src/pkjs/clay/builder/ts/grid/init.ts
import { createPalette } from '../../../../../../paf/ts/clay/builder/ts/shared/palette';

const palette = createPalette({
  container: root.querySelector('.grid-palette') as HTMLElement,
  modules: panels,
  groups: [{ name: 'Clock', icon: '⏰' }, { name: 'Weather', icon: '🌤' }],
  sizes: [{ key: '1x2', wide: false }, { key: '1x4', wide: true }],
  thumbFor: function (value, size) {
    return shotFor(value, size);
  },
  onPick: function (panel, size, event) {
    drag.start({ panel: panel, size: size }, event);
  },
});

palette.markPlaced(placedValues);
```

* **The Panels.** Each one carries a `value`, a `label`, the `sizes` it comes in, and an `icon` and `color` the tile shows when `thumbFor` has no shot for it. Its `group` is the name of one of the face's groups. A panel with no group, or a group the face does not list, shows under Other, after the face's own groups.
* **The Groups and Sizes.** Both are the face's, and the tabs keep the order they come in. `All` and `Other` are the palette's own group names, so a face's group never takes either. The palette tells its tabs apart by name, so a group called `All` shows every panel when picked. One called `Other` gets a second Other tab beside the palette's. Both show the face's group, so the panels nobody grouped only show under All. A name the face lists twice is one group, at its first place and with its first icon, holding each of its panels once. A `wide` size spans the grid, so its tiles are twice as wide.
* **What It Hands Back.** `onPick` gets the panel and the size on show on the tile's `pointerdown`, ready to start a drag. `markPlaced` dims the tiles of the panels already on the face, and the dimming lasts through every group switch.

Its stylesheet is `css/palette.css`, which a manifest lists in its `styles` like its own, and the classes all start with `pf-palette`. It lays the palette out and leaves the colours of the tabs and Show All to the face. A face sets the box's fill with `--pf-palette-panel`, its edges with `--pf-palette-line`, and the side gutter with `--pf-palette-gutter`, 12px unless set. A size tab carries `active` while it is picked, a group tab carries `aria-pressed`, and a tile carries `placed`.

### Warning about Panels That Need a Plugin

The `ts/shared/plugin-warnings` piece puts a warning under the watch for each placed panel that reads a Pebble app plugin the phone cannot serve, such as a now playing panel while plugins are off, or a stock panel whose Data Source is the plugin with no stock plugin installed. It reads where each kind stands from the plugin kinds row, as [Which Kinds the Phone Serves](plugin-sources.md#which-kinds-the-phone-serves) covers, so a face that reads no plugin shows no warning.

```ts
// in the same init.ts
import { createPluginWarnings } from '../../../../../../paf/ts/clay/builder/ts/shared/plugin-warnings';

const root = this.$element[0];
const warnings = createPluginWarnings({
  root: root,
  after: root.querySelector('.grid-watch') as HTMLElement,
  panelKinds: { 'Now Playing': 'music', 'Phone Battery': 'phone', 'Forecast': 'weather', 'Stock': 'stocks' },
});

// on every change to the grid, with the names of the panels the watch shows
warnings.update(['Now Playing', 'Stock']);
```

`panelKinds` names the kind each panel reads, by the name `update` gets, and a panel left out reads no plugin. Plugins off folds every panel into one warning. Otherwise each kind with no plugin gets its own, naming its panels once.

A now playing or phone battery panel always reads its plugin. A weather, stock, or calendar panel only reads one while its Data Source is the plugin, and a builder cannot read the source selects from its own row. So the framework runs page code of its own, `builderPluginSources` in [`builder-plugin-sources-fn.ts`](../../src/ts/clay/builder-plugin-sources-fn.ts), on every page that holds the plugin kinds row, and the face passes nothing for it. It runs after the key for each provider and before the face's own `customClay`. Once the page is built, it reads `WEATHER_PROVIDER`, `STOCK_PROVIDER`, and `CALENDAR_SOURCE`, and hands what the wearer picked to every builder on the page that made a warning box, through the `_pfPluginSources` hook `createPluginWarnings` hangs on `root`. It does that again whenever one of the selects changes. A kind with no select on the page reads as picked, since a face whose `providers` list is the plugin alone has no select and its panels always read the plugin. A select that drops to its one option while the face is on a source of its own, such as the calendar on its iCal link with plugins off, takes its kind out of the plugin kinds row, so its panels stay quiet. A page with no builder that made a warning box is left as it is. Until the page code first calls the hook, the box names no weather, stock, or calendar panel. The framework runs `builderPluginSources` on its own, so a face never passes it.

## Previewing the Page

The `dev` plugin's `clay-preview` tool builds a face's real page into an HTML file a browser opens, as [Previewing the Settings Page](dev-plugin.md#previewing-the-settings-page) covers.
