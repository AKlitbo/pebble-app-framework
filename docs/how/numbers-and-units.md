# Numbers and Units

A face draws bars, gauges, and graphs, and shows readings in the wearer's own units. The framework gives it the maths behind those: how full a goal bar is, how many cells of a battery gauge to light, which row a reading sits on in a graph, a walked distance in kilometres or miles to a tenth, and a wind speed in km/h, mph, knots, or m/s. None of it uses floating point. Float maths pulls library code into the app, and the watch's `snprintf` cannot print a float anyway (see [Fitting Text](fitting-text.md)), so every sum here multiplies before it divides and stays in whole numbers.

The maths lives in `src/c/core/math/`, in [`pct.h`](../../src/c/core/math/pct.h), [`scale.h`](../../src/c/core/math/scale.h), and [`series.h`](../../src/c/core/math/series.h), and the conversions in `src/c/core/units/`, in [`distance.h`](../../src/c/core/units/distance.h) and [`wind.h`](../../src/c/core/units/wind.h). They are in `c/core` (see [Where the Code Lives](index.md#where-the-code-lives)), so they take plain numbers and give plain numbers back, never a `GRect` or a reading from the watch.

## How Far to a Goal

`pct_of(value, goal)` gives a goal's progress from 0 to 100:

```c
if (goal <= 0 || value <= 0)
{
    return 0;
}

int pct = (value * 100) / goal;
return pct > 100 ? 100 : pct;
```

**Capped at 100.** Walking twice the step goal is an ordinary day, and a bar drawn from 200 would run past its own outline.

**Rounded Down.** 9,999 steps of a 10,000 goal reads 99, so a bar is only full once the goal is really met.

**No Goal, No Reading.** A goal of 0 reads 0 rather than dividing by it. So does a negative value, which is how the readouts mark "no reading yet". That makes no data look the same as none of the goal done, so a face that shows dashes for no data checks before it asks.

## Lighting Cells

`segments_filled(level, segments)` says how many cells of a gauge a level from 0 to 100 lights. It rounds up, so any charge at all lights a cell:

```c
level = clamp_int(level, 0, 100);
int filled = (level * segments + 99) / 100;
```

On a five cell battery gauge, 1% and 20% each light one cell, 21% lights two, and only 100% lights all five. Rounding down would show an empty gauge on a battery with 19% left. A level outside 0 to 100 is pinned first, so a stray reading cannot light a sixth cell.

The rest of [`scale.h`](../../src/c/core/math/scale.h) and [`series.h`](../../src/c/core/math/series.h) covers the other sums a chart needs, such as pinning a value to a range, splitting a strip into cells, placing a reading on a graph's rows, and the lowest, highest, and latest real reading in a history with gaps.

## Distance in Kilometres or Miles

The health store reports the distance walked in metres. `distance_format_value` turns that into kilometres or miles to one decimal place, and `distance_format` adds the unit, as in `3.1 MI` or `5.0 KM`.

It counts in tenths of the unit, in whole numbers. A tenth of a kilometre is 100 metres. A tenth of a mile is 160.9344 metres, so the tenths are the metres times 10000 / 1609344, which is 625 / 100584 once both are divided by 16:

```c
int tenths = miles ? (meters * 625 + 50292) / 100584 : (meters + 50) / 100;
snprintf(buffer, size, "%d.%d", tenths / 10, tenths % 10);
```

Adding half the divisor before dividing rounds to the nearest tenth rather than down. For 5,000 metres:

```
miles: (5000 × 625 + 50292) / 100584 = 3175292 / 100584 = 31   reads 3.1
km:    (5000 + 50) / 100             = 5050 / 100       = 50   reads 5.0
```

The rounding carries across the point, so 4,960 metres reads `5.0` km rather than `4.9`. A negative distance reads `0.0`.

**How Far It Reaches.** The miles sum multiplies before it divides, and the product stays inside a 32-bit `int` up to about 3,400 km. Reducing the fraction is what makes that room. Multiplying by the unreduced 10000 would overflow past about 215 km.

## Wind Speed

The weather store keeps the wind in km/h whichever provider it came from, rounded to a whole number on the phone. `wind_from_kmh(kmh, unit)` converts it on the watch, and `wind_unit_label` gives the label to show beside it, `KM/H`, `MPH`, `KTS`, or `M/S`:

```c
case WIND_UNIT_MPH: return (kmh * 621) / 1000;
case WIND_UNIT_KTS: return (kmh * 540) / 1000;
case WIND_UNIT_MS:  return (kmh * 278) / 1000;
```

The factors are the real ones to three places, and the result is cut to a whole number rather than rounded. 30 km/h is 18.6 mph and reads 18, 16.2 knots and reads 16, and 8.3 m/s and reads 8. So a converted speed can read one below the nearest whole number, which is small next to how much the wind gusts.

**No Reading First.** The store's marker for no wind reading is -1, and -1 km/h converts to 0 mph, since the division rounds toward zero. A face checks for no reading before it converts, or a missing wind shows as calm.

**The Setting Is the Face's.** The framework has no wind unit setting of its own. The units are numbered 0 for km/h, 1 for mph, 2 for knots, and 3 for m/s, so a face adds a four way select to its page with those values and passes the stored byte straight in. A number outside that range reads as km/h.
