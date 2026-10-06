# The Julian Date

The Julian Date counts days in one long run, with no months or years to get in the way. Astronomers use it because the gap between two dates is a plain subtraction. Day 0 began at noon UTC on the 1st of January 4713 BC, so the 1st of January 2000 at noon was day 2451545.

A face shows it as a readout, such as the Julian panel in the Mosaic family or the LCARS face's Julian slot. The code lives in [`astro.h`](../../src/c/core/clock/astro.h) and [`astro.c`](../../src/c/core/clock/astro.c) under `src/c/core/clock/`, a single function in plain C.

## Working It Out

The Unix clock counts seconds from midnight UTC on the 1st of January 1970, which is Julian Date 2440587.5. So the Julian Date is that, plus the seconds since then turned into days:

```
JD = 2440587.5 + seconds / 86400
```

The `.5` is there because a Julian day starts at noon, so midnight falls halfway through one.

`astro_jd_centi` works this out without floating point, by returning the Julian Date times 100. The whole part is the day and the last two digits are hundredths of a day:

```c
long q = (long)utc / 86400;
long r = (long)utc % 86400;
return (int32_t)(244058750L + q * 100 + (r * 100) / 86400);
```

**Days and the Rest, Apart.** Multiplying the seconds straight by 100 would need about 180 billion, far past a 32-bit number. Splitting them into whole days, `q`, and the seconds left over, `r`, keeps each multiply small. `q * 100` is around two million, and `r * 100` is at most 8,639,900.

**The `.5` Baked In.** `244058750` is 2440587.5 times 100, so the half day costs nothing at runtime.

**Hundredths Round Down.** A hundredth of a day is 864 seconds, about 14 and a half minutes. The division drops any part of a hundredth, so the reading never runs ahead of the clock.

As an example, midnight UTC on the 5th of October 2026:

```
utc     = 1791158400
q       = 1791158400 / 86400 = 20731 days
r       = 0 seconds left over
result  = 244058750 + 20731 × 100 + 0 = 246131850   (JD 2461318.50)
```

## The Day Turns at Noon

A face that shows the whole day number divides by 100:

```c
int32_t jd = astro_jd_centi(time(NULL)) / 100; // the whole Julian Date
```

Because a Julian day starts at noon UTC, that number ticks over at noon UTC rather than at local midnight. On the 5th of October 2026 it reads 2461318 until 11:59:59 UTC and 2461319 from 12:00:00 UTC. That is 8 in the morning in Toronto and 1 in the afternoon in London that day. A face showing it beside an ordinary date will see the Julian number change partway through the local day.
