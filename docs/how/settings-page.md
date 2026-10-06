# The Settings Page

The framework builds a face's settings page from a short description of what the face shows. `buildConfig` lays out the standard sections in a fixed order, from the theme picker to the stock tickers, and a face with a layout of its own builds the page from the same sections and a few row helpers. Beside the plain controls it gives every face a location search for weather and second clocks, a hidden store for a component's scratch state, and a generator that bundles a face's own editor, such as a drag and drop grid, into one Clay component file. The page is built with Clay and runs in the phone app's web view.

The sections are in [`config-builder.ts`](../../src/ts/pkjs/config-builder.ts) and the row helpers in [`config-rows.ts`](../../src/ts/pkjs/config-rows.ts). The components are under `src/ts/clay/`, in [`location-component.ts`](../../src/ts/clay/location-component.ts) and [`hidden-store-component.ts`](../../src/ts/clay/hidden-store-component.ts), with the shared types in [`types.ts`](../../src/ts/clay/types.ts). The generator is [`generate-components.ts`](../../src/tools/clay-components/generate-components.ts) and its check is [`check-components.ts`](../../src/tools/clay-components/check-components.ts). What happens once the wearer presses Save is on [The Life of a Setting](life-of-a-setting.md), [The Phone Side](phone-side.md), and [Settings on the Watch](settings-on-the-watch.md).

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

**The Order.** A heading and an intro line open the page, and a **Save & Apply to Watch** button closes it. In between, the sections always come in this order:

| Section | Shown When | What It Offers |
| :-- | :-- | :-- |
| Appearance | always | the theme picker when `theme` is passed, the face's `appearanceItems`, and a Quiet Time icon toggle with `quietTime` |
| the face's own | `layoutSections` is passed | whatever the face builds, such as a layout editor |
| Bluetooth | always | the connection icon, and a buzz on connect and on disconnect |
| Clock | always | the date and time formats, the face's `clockItems`, a second clock's time zone with `clock.timeZone`, and the hourly buzz with `hourlyVibe` |
| Health | `steps` or `battery` | what the steps readout counts, and how the battery reads |
| Location Settings | `location` | phone GPS, a fallback, and a manual place |
| Weather | `weather` or `temperature` | the unit, and the provider with its key |
| Calendar Preferences | `calendar` | the iCal link, then the face's own `items` |
| Stock Preferences | `stocks` | the provider, its key, and the tickers, then the face's own `items` |

**Each Section Brings Its Keys.** Every message key a section uses has to be declared in the face's `pebble.appinfo.json`, and each one adds to the inbox the face sizes, as [Opening the Connection](talking-to-the-phone.md#opening-the-connection) covers. Bluetooth and Clock are always on the page, so their keys are always needed. An optional section that is left out brings no keys, which is why Health returns nothing at all for a face that shows neither steps nor battery, rather than a heading over nothing.

**The .beat Formats.** `date.beats` adds the .beat formats to the end of the date list. Their `{B}` marker is not a `strftime` token, and only `readout_date` swaps it for the time in .beats, so a face asks for them only when its date line runs through `readout_date`. [.beats](beats.md) covers the reading.

**Controls Clay Filters by Watch.** `steps.capabilities` is Clay's own filter, checked against the watch the page was opened from, so `['NOT_PLATFORM_GABBRO']` drops the steps control on a round watch and keeps it everywhere else. When steps is alone in the Health section, its heading takes the same filter, so a round watch never shows a section title with nothing under it.

**Selects Send Text.** A select's value comes from an HTML option, and an option's value is always text. So an option written as `{ label: 'Day', value: 1 }` comes back from the page as `"1"`, and Clay sends it to the watch that way. The framework's sections leave Clay's `serializeValueAs` alone, so every select travels the same way, including the ones whose values really are text, such as the date format `%Y.%m%d` or the weather provider `openmeteo`. [Settings on the Watch](settings-on-the-watch.md#taking-values-from-the-phone) covers how the watch reads a choice.

**The Stock Providers Are Written Out.** The Stock section lists its data sources by hand rather than reading them from the stock feature. The section builder is in every face's phone bundle, and importing the feature would carry the stock providers into faces that show no stocks.

## Laying Out a Page by Hand

`buildConfig` is the section builders in their usual order. Each one is exported on its own and takes the same description: `appearanceSection`, `bluetoothSection`, `clockSection`, `healthSection`, `locationSection`, `weatherSection`, `calendarSection`, and `stocksSection`. The optional ones return `null` when the description leaves them out. A face whose page needs its own sections between the standard ones calls the builders it needs and puts them in its own order.

For the rows inside its own sections, [`config-rows.ts`](../../src/ts/pkjs/config-rows.ts) has `select`, `heading`, and `toggle`, plus `VIBE_OPTIONS`, the plain buzz picker whose values line up with the watch's own vibration choices:

```ts
import { bluetoothSection, clockSection } from '../../paf/ts/pkjs/config-builder';
import { heading, select, toggle, VIBE_OPTIONS } from '../../paf/ts/pkjs/config-rows';

const options = { hourlyVibe: {} };

export default [
  {
    type: 'section',
    items: [
      heading('Goals'),
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

## Custom Components

A Clay component is an object that Clay turns into one kind of row, with the parts [Clay's own guide](https://github.com/pebble-dev/clay#custom-components) describes. A face passes its own in `components`:

```ts
app.startPebbleApp({
  clayConfig,
  components: [gridEditor, hiddenStoreComponent],
  features: [weather],
});
```

`startPebbleApp` registers them before the page is built. The location search is registered for every face, so a page can use `locationsearch` without listing it.

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

**The Custom Function Too.** A face can pass Clay's custom function as `customClay`, which runs once on the page with the whole page as `this`, before any row is built. It is copied the same way and follows the same rules.

### Scratch State in a Hidden Store

The web view gives the page no `localStorage` of its own, so a component cannot remember anything there between visits. The `hiddenStore` component is a hidden input on Clay's `val` manipulator. It shows nothing, and its value is saved with the other settings and handed back the next time the page opens.

```ts
{ type: 'hiddenStore', messageKey: 'GRID_LIBRARY', storeClass: 'grid-library', defaultValue: '' },
{ type: 'gridEditor', messageKey: 'GRID', defaultValue: '1,0,0,2,2' },
```

**What a Store Holds.** A store holds scratch state the watch never reads, such as a library of saved layouts the editor lets the wearer switch between. It also carries the extra settings of a component that edits more than one, which the watch reads as ordinary settings.

**Finding a Store.** Every store carries the `gl-store` class, so a page with more than one gives each a `storeClass` as well, and the component finds its store by that class. A plain lookup on `gl-store` would keep finding the first one.

**Stores Go above the Component.** A row below a component is not on the page yet when the component initializes, so a store declared after its editor is not there to be read. Declare the stores first. An editor can also read its stores again once the page has finished building.

**A Store Costs Message Room.** A store is a message key like any other. It has to be declared, and Clay sends it to the watch on every save even when the watch never reads it, so a large library adds to the size the watch's inbox needs. [Opening the Connection](talking-to-the-phone.md#opening-the-connection) covers sizing the inbox for the whole page.

## The Location Search

`locationsearch` is a search box that finds places as the wearer types. After two characters and a short pause it asks Open-Meteo's free geocoder for five matches. Picking one saves the place as JSON, with its coordinates, its label, and its time zone:

```
{"lat":51.5,"lon":-0.13,"label":"London, England, United Kingdom","offset":60,"tz":"Europe/London"}
```

Typing clears the saved place, so a name typed but never picked from the list saves as nothing, and a note under the box says so. A geocoder answer that lands after a newer query is dropped, so a slow reply cannot replace the list for what the wearer has typed since.

**GPS and the Manual Place.** The Location Settings section puts **Enable Phone GPS** and **Fallback to Manual Location** beside the search. GPS starts off unless the face passes `location: { gpsDefault: true }`, and the fallback starts on. [Where the Location Comes From](fetching-the-weather.md#where-the-location-comes-from) covers how a fetch picks between them.

**A Second Clock.** An item marked `timeZone: true` becomes a time zone picker, which `clock: { timeZone: true }` adds to the Clock section. A hand-built page can mark any `locationsearch` item the same way, and the phone keeps each marked item's offset current. [Picking a Place](time-zones.md#picking-a-place) covers what the picker offers and how the saved zone becomes the offset the watch is sent.

## A Face's Own Builder

An editor too big for one hand-written component, such as a drag and drop grid with presets and an import panel, is written as small TypeScript pieces and bundled into a component. The pieces are plain modules, so Vitest tests them like any other code, and the generator turns them into the one self-contained file Clay can copy.

A face keeps its pieces under `src/pkjs/clay/builder/`, and a family keeps the ones its faces share under `core/pkjs/clay/builder/`. A manifest beside them names the component, its template and stylesheets, the pieces to bundle, and where the finished `*.g.js` lands in the face. One piece, `init`, hangs the hooks on the row that the generated manipulator calls. `paf gen <face> clay` bundles the pieces with esbuild into one function that becomes the component's `initialize`, and parses the finished file once before it writes it, so a file that does not parse never lands.

**Where a Piece Comes From.** A piece is looked up in the face first, then in its family's core, then in the framework's `src/ts/clay/builder/`, by the same path under each. A face's copy wins even when a shared piece is the one importing it. So one manifest in a family's core can build a different editor for each face: the drag handling and the popup panels come from the framework, and each face supplies its own grid geometry, the code that reads and writes its layout string, its starter layouts, and its template. Manifests shadow each other the same way, by file name.

**Committed, and Checked.** The build never runs the generator. It compiles the face's phone code, leaves the builder pieces out of the compile so they do not ship a second time as loose modules, and copies every committed `*.g.js` beside the result. The committed file is therefore all the page ever sees, and a piece edited without a fresh `paf gen` ships the old editor. `paf check` builds every component again in memory and compares it with the committed file, and a stale one is reported with the `paf gen` line that fixes it. It also reports a committed component no manifest writes any more, since the build would still copy it into the face.

## Previewing the Page

The `dev` plugin's `clay-preview` tool builds a face's real page into an HTML file a browser opens, as [Previewing the Settings Page](dev-plugin.md#previewing-the-settings-page) covers.
