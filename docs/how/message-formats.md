# The Message Formats

Most values reach the watch as a single number or a piece of text in an AppMessage. The weather forecast, the stock watchlist, and the calendar agenda are lists, and AppMessage has no list type, so the phone packs each one into a run of bytes and the watch unpacks it. The framework owns both ends of each format, and the watch checks every message against its own length before it uses any of it, so a short or garbled message is turned away whole and the last good list stays on screen.

The watch's readers live under `src/c/core/wire/`, in [`weather_wire.c`](../../src/c/core/wire/weather_wire.c), [`stock_wire.c`](../../src/c/core/wire/stock_wire.c), and [`calendar_wire.c`](../../src/c/core/wire/calendar_wire.c), with the byte readers in [`bytes_le.h`](../../src/c/core/io/bytes_le.h). The phone's packers are in [`wire.ts`](../../src/ts/pkjs/wire.ts). The readers are in `c/core` (see [Where the Code Lives](index.md#where-the-code-lives)), so they take a pointer and a length rather than anything from the SDK. A store gets the raw bytes from [the AppMessage layer](talking-to-the-phone.md), hands them to its reader, and only keeps the result when the reader says the whole message was good.

## What Every Format Shares

**A Count Comes First.** Each list opens with one byte saying how many entries follow. The watch pins it to the room it has, 8 forecast columns, 4 quotes, or 6 events, so a count of 200 can never walk the reader off the end of an array. The phone cuts its lists to the same sizes, so only a damaged message ever needs the pin.

**Numbers Are Little-Endian.** The low byte comes first. The reader builds each number a byte at a time with shifts rather than casting the pointer to a wider type, so it reads the same whatever the alignment of the bytes, and a list that starts at an odd address inside a message is no problem. Temperatures, price changes, and times are signed, and the readers keep the sign, so a temperature of -3 never reads as 65533.

**Text Is a Length and Then the Letters.** A string goes over as one byte for its length and then that many bytes, with no terminator. The watch copies what fits in its buffer and adds the terminator itself.

**Both Sides Read One Table.** The list sizes, the text lengths, and the marker values are written once, in `WIRE_CAPS` at the top of `wire.ts`. `npm run build:conditions` writes them into [`wire_caps.g.h`](../../src/c/core/wire/wire_caps.g.h) for the watch. The phone counts text lengths in characters, and the watch's buffers are one byte bigger for the terminator.

## The Forecast Strips

The hourly strip is a header and then up to 8 columns, all fixed width:

| Bytes | Holds |
| :-- | :-- |
| 1 | how many columns |
| 1 | the hour of the first column, 0 to 23 |
| 1 | the hours between columns |
| 1 per column | the condition |
| 2 per column | the temperature, signed |

The daily strip is the same idea with a weekday in place of the hour, and two temperatures per column:

| Bytes | Holds |
| :-- | :-- |
| 1 | how many columns |
| 1 | the weekday of the first column, 0 for Sunday |
| 1 per column | the condition |
| 2 per column | the day's high, signed |
| 2 per column | the day's low, signed |

Each column's condition goes over as one byte, the sky code, which is the condition's place in the shared list of conditions, so 0 is clear and 6 is rain. 255 means the phone did not recognize the condition, and the watch draws its fallback icon. On the hourly strip the top bit marks a column after dark, so the watch picks the night icon. The daily strip never sets it, since a whole day has no night of its own.

A temperature the phone does not have goes over as -1000, well outside any real reading. 0 could not do the job, since 0 degrees is a real reading.

Two hourly columns starting at 21:00, three hours apart, with a clear night at 12 degrees and then rain with no temperature:

```
02         two columns
15         first column at hour 21
03         three hours apart
80         clear, after dark
0C 00      12 degrees
86         rain, after dark
18 FC      -1000, no reading
```

**One Check Settles the Whole Strip.** Every column is the same width, so the length the message needs is known from the count before anything is read: three header bytes and three per column for the hourly strip, two and five for the daily. A message shorter than that is refused, and the strip already on the watch stays. Bytes left over after the last column are ignored.

Since nothing can fail after that check, the reader writes straight into the strip the caller holds. The watchlist and the agenda work differently, below, and keeping a second copy of each forecast strip to guard against a failure that cannot happen would cost memory for nothing. What the watch does with the first column's hour, such as dropping the columns that have gone by, is on [Weather Readings](weather-readings.md).

## The Watchlist

The watchlist is a count and then up to 4 quotes laid end to end. A quote's length depends on its label:

| Bytes | Holds |
| :-- | :-- |
| 1 | how many quotes |
| 1 per quote | 1 for a live quote, 0 for a status message |
| 4 per quote | the price in cents, signed |
| 2 per quote | the change in hundredths of a percent, signed |
| 1 per quote | the label's length |
| the length | the label |

A live quote's label is its ticker. A quote the phone could not fetch carries a short status word in the same place, such as `RATE LIMIT` or `INVALID KEY`, so the slot on the watch shows why it is empty.

Apple at $150.12, down 1.25 percent, is 13 bytes:

```
01             one quote
01             live
A4 3A 00 00    15012 cents
83 FF          -125, down 1.25 percent
04             four letters follow
41 41 50 4C    AAPL
```

**The Ranges.** Cents in four bytes reach about 21 million dollars. Hundredths of a percent in two bytes reach about 327 percent either way. The phone rounds each number and then pins it to its range before packing, so a stock up 400 percent shows 327.67 rather than wrapping round to a large fall.

**Checked at Every Step.** Nothing about a quote is fixed width, so the reader cannot know the whole length up front. It checks before each quote that its fixed 8 bytes are there, and before each label that the label fits inside the message. A message that says four quotes but stops after two is refused at the third.

**Built Aside, Kept Only When Whole.** The reader fills a fresh watchlist of its own, and copies it to the caller only once the whole message has read cleanly. So a message that fails at the third quote leaves the caller's watchlist exactly as it was, rather than two new quotes beside two old ones. The store then keeps showing its last good watchlist and does not save anything.

**A Long Label Is Stepped Over Whole.** A label longer than the 11 characters the watch holds is cut to fit, and the reader still steps past every byte of it. Stopping at the cut would leave the next quote being read from the middle of this one's label.

**Empty Is Different from Missing.** An empty watchlist packs as a count of 0, which clears the watchlist on the watch. When the phone has no list at all, it sends nothing, and the watch keeps what it has. A gap in the phone's list packs as a failed quote rather than being skipped, since a skipped one would leave the count promising more quotes than follow, and the watch would refuse the lot.

## The Agenda

The agenda is a count and then up to 6 events laid end to end, each with two strings of its own:

| Bytes | Holds |
| :-- | :-- |
| 1 | how many events |
| 4 per event | the start, in seconds since 1970, signed |
| 4 per event | the end, the same way |
| 1 per event | flags, with the lowest bit set for an all-day event |
| 1 per event | the title's length |
| the length | the title, up to 24 characters |
| 1 per event | the location's length |
| the length | the location, up to 16 characters |

It is read the same way as the watchlist: a check before each event's fixed 10 bytes, before the title, before the location's length, and before the location, all into a copy that the caller only gets when every event read cleanly.

**Times on the Watch's Own Clock.** The start and end are absolute times rather than "in 20 minutes", so a countdown on the watch stays right between fetches by reading the watch's clock against them.

**Pinned to 2038.** The watch reads both times as signed 32-bit numbers, which run out in January 2038. A feed can carry an event whose end is far beyond that, and its low four bytes alone would land somewhere in 1969, putting the end before the start and every duration negative. The phone pins both times to the 32-bit range before packing, so such an event reads as running until 2038 instead.

## Text on the Way Over

The watch's fonts only carry the printable ASCII characters, so the phone flattens every title, location, and label before packing it. An accented letter loses its accent, so Réunion goes over as Reunion. Anything else outside ASCII becomes one question mark.

**An Emoji Costs One Character.** The flattening walks the text by Unicode code point rather than by JavaScript's two-byte units, and drops the pieces that only change the character before them, such as skin tones and the joiners between people. An emoji is one question mark rather than two, and so is a family emoji built from several people, or a flag. A title only has 24 characters on the watch, and each extra mark would cost it a real letter.

**Cut before Packing.** The text is cut to the watch's length on the phone, so the length byte never promises more than the watch keeps. The watch still copies only what fits, so a phone that sent more would lose the end of the text and nothing else.

## Single Values and Coordinates

Everything that is not a list goes over as an ordinary AppMessage value: the temperature, the humidity, the sunrise time, each setting. Those are read through the checked readers on [Talking to the Phone](talking-to-the-phone.md#reading-values-safely), which read a number at the width the phone sent it and refuse text with no terminator. The reading itself is in [`wire_read.h`](../../src/c/core/wire/wire_read.h), next to the list readers here.

Coordinates arrive as two pieces of text, in whatever form the face's formatter on the phone writes them, such as `33-44` and `-112-07`. When the phone has no fix, it sends something that is not a coordinate, an empty string or a word. [`coords.h`](../../src/c/core/wire/coords.h) tells the two apart with one test: a real coordinate always holds a digit, and the phone's ways of saying "no fix" never do. Both halves have to pass. The location store shows whatever arrived, but it only saves a pair that passes, so losing the fix for a while never overwrites the last good one in flash. [The Location Store](location-store.md) covers the rest.
