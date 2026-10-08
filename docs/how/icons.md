# Icons

The icon code loads each picture once and shares it across the whole face, paints a white icon any colour the theme calls for, measures the empty border around each icon so it can be lined up by what is actually drawn, and turns a weather condition into the right icon for day or night. A face asks for an icon by its resource id each time it draws, and never loads or tracks a picture itself. One call to `icons_cleanup` on the way out frees them all.

The cache and the tint live in [`icon_cache.h`](../../src/c/pebble/ui/icon_cache.h) and [`icon_cache.c`](../../src/c/pebble/ui/icon_cache.c), and the weather lookup in [`icons.h`](../../src/c/pebble/ui/weather/icons.h), [`icons.c`](../../src/c/pebble/ui/weather/icons.c), and the generated [`icons_table.g.h`](../../src/c/pebble/ui/weather/icons_table.g.h), all under `src/c/pebble/ui/`.

## Where the Pictures Come From

A face lists its icons in `resources/icons.json`, each with the SVG it comes from and the size it shows at. The [icons plugin](icons-plugin.md) draws each SVG into a PNG at exactly that size, since Pebble draws a bitmap at its own size and never scales it. Every icon comes out white, with soft edges made of partly see-through pixels, so it packs on the watch as a small colour table of white at a few levels of see-through, as [Why the Icons Are White](icons-plugin.md#why-the-icons-are-white) covers.

## The Cache

`icon_get` takes a resource id and hands back the picture, loading it the first time it is asked for and handing back the same one after that. A face draws straight from it:

```c
GBitmap *icon = icon_get(RESOURCE_ID_ICON_HEART);
if (icon)
{
    graphics_context_set_compositing_mode(ctx, GCompOpSet);
    graphics_draw_bitmap_in_rect(ctx, icon, HEART_RECT);
}
```

`GCompOpSet` draws the see-through pixels as see-through, so the soft edges blend into whatever is underneath. NULL means the picture could not be loaded, usually because the heap was full, and a later call tries again.

**24 Icons at Once.** The cache holds up to 24 pictures, enough for two forecast strips of eight columns with a few panels under them. When it is full, the icon nothing has asked for in the longest time is freed to make room. That is how icons nothing draws any more, such as last week's moon phase, drop out without the face having to free them. The new picture is loaded before anything is freed, so a load that fails costs the cache nothing.

**Too Many for the Cache.** A screen that draws more than 24 icons still works, but slowly. A redraw asks for its icons in the same order every time, so the icon freed to make room is always the next one wanted, and every icon is loaded from flash again on every redraw. Once the heap is crowded, one of those loads can fail and leave a blank. A face that draws more than 24 sets `ICON_CACHE_MAX` in its appinfo's `defines`, up to 255.

**Draw It Straight Away.** A picture from the cache is only safe until the next lookup of a different icon, which might free it. So a face looks it up, draws it, and lets go of it in the same paint. Setting one on a `BitmapLayer`, which keeps the pointer and draws later, can leave that layer pointing at a freed picture.

## Painting an Icon a Colour

`icon_tint` repaints an icon by rewriting its colour table. Every entry that is not fully see-through gets the new red, green, and blue, and keeps its own level of see-through, so the soft edges stay soft in any colour:

```c
GBitmap *icon = icon_get(RESOURCE_ID_ICON_BLUETOOTH);
icon_tint(icon, theme_text_colour());
graphics_context_set_compositing_mode(ctx, GCompOpSet);
graphics_draw_bitmap_in_rect(ctx, icon, BT_RECT);
```

One white master serves every theme. The alternative is a separate copy of each icon for each colour, which multiplies the app's resources by the number of themes and still could not follow a colour the wearer picks freely.

**Only Pictures with a Colour Table.** A picture stored at eight bits a pixel has no table to rewrite, and `icon_tint` leaves it alone with its own colours, so the same drawing code can take either kind. The flip side is that a tinted picture with several real colours in its table comes out as one flat colour, since every visible entry gets the same one. Tinting is for single colour art.

**The Tint Stays on the Picture.** The rewrite changes the cached picture itself, so it holds until the next tint. The cache remembers the last colour each icon was given and skips the rewrite when it is asked for the same one, which is every redraw on a face that does not change theme. The same icon can still show in two colours on one screen, because each place tints it right before drawing it. A picture that came from somewhere other than the cache is rewritten every time.

## Lining Up by the Visible Art

Icons from different sources leave different amounts of empty space around the glyph. A sun from one set might touch the top of its box while a cloud sits three pixels down, so lining up the boxes leaves the glyphs uneven.

The first time the cache loads an icon, it scans the picture once for its outermost visible pixels and keeps the empty margin on each side. `icon_margins` hands those back for free on every later call. A face uses them to place the glyph rather than the box, such as pushing an icon down when its art reaches too close to a bar above it:

```c
GRect at = WX_ICON_RECT;
int top = icon_margins(resource).n;
if (top < MIN_TOP_GAP)
{
    at.origin.y += MIN_TOP_GAP - top;
}
```

`icon_align_trim` does the general case. Given where the icon is pinned, such as its top right corner or its centre, it works out the shift that pins the visible art there instead. A right edge removes the empty space on the right, and a centred axis splits the difference so the art itself is centred. `icon_margins_of` runs the same scan on a picture that did not come from the cache, for a face that keeps one of its own.

## Weather Icons

`wx_resource_for` turns the condition the phone sent into the icon to draw:

```c
GBitmap *icon = icon_get(wx_resource_for(weather_store_cond()));
```

The phone sends the condition as a short label, such as `RAIN`, and after dark it sends a night form such as `RAIN_NIGHT` when the condition has a night icon. Every condition in the list has one, so after dark a clear sky shows a moon rather than a sun. Freezing drizzle and freezing rain share the sleet icons, since there is no separate glyph for freezing drizzle. A condition the watch does not know, or none at all, gets the not-available icon rather than nothing.

**Day or Night Comes from the Phone.** The watch does not work out whether it is dark. Each weather provider says in its reply whether the reading is for day or night, and the phone adds `_NIGHT` from that, so the icon follows the provider's idea of sunset at the reading's location. The text readout trims the `_NIGHT` back off (see [Readouts](readouts.md)).

**One List on Both Sides.** The table of conditions and icons is generated from the same list of conditions the phone uses, [`conditions.ts`](../../src/ts/weather/conditions.ts), so a condition added there reaches the phone and the watch together, and the two can never spell a condition differently. [Weather Readings](weather-readings.md#condition-labels) covers the labels.

**Forecast Strips.** A forecast column has no room for a label, so the phone sends each column's condition as a single number, its place in that same list. An hourly column after dark also has its top bit set, which tells the face to use the night icon for that hour. The phone sets it from the provider's own day or night flag for that hour. A daily column is a whole day, so it always gets the day icon. The framework's lookup covers the icons for the current conditions, and forecast columns usually draw smaller ones, so a face maps the number to its own small icons, and `WX_FORECAST_NIGHT_BIT` from the generated wire header gives it the bit to test.

**Only for a Face That Ships Them.** The lookup names every weather icon's resource id, which only exists when the face ships those icons. So the build only compiles it for a face whose resources include the not-available weather icon, which always ships with the rest of the set. A face without weather icons builds without the lookup, rather than failing on resource ids it does not have.
