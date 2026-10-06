# Fitting Text

Every string a face shows sits in a fixed `char` array, and much of that text comes from somewhere the watch does not control: the settings page, a weather provider, a calendar. A string one byte too long for its array writes over whatever sits next to it, and on the watch that shows up as a crash or as garbage on screen with nothing in the log. The text helpers make every copy fit and stay terminated, tell whether a copy would change anything, print the numbers the watch's own `snprintf` cannot, and put a date into capitals for fonts that only carry capitals. Fitting text to a slot's width in pixels is the engine's job, covered in [The Engine](engine.md#text-that-fits-its-slot).

They live under `src/c/core/text/` (see [Where the Code Lives](index.md#where-the-code-lives)), in [`cstring_fit.h`](../../src/c/core/text/cstring_fit.h), [`number_format.h`](../../src/c/core/text/number_format.h) and [`number_format.c`](../../src/c/core/text/number_format.c), and [`text_case.h`](../../src/c/core/text/text_case.h) and [`text_case.c`](../../src/c/core/text/text_case.c).

## Copying into a Fixed Buffer

`cstring_fit` is the copy the framework uses for text it keeps, from settings to the weather's condition text:

```c
static inline void cstring_fit(char *dst, const char *src, size_t size)
{
    if (size == 0)
    {
        return;
    }

    if (!src)
    {
        dst[0] = '\0';
        return;
    }

    strncpy(dst, src, size - 1);
    dst[size - 1] = '\0';
}
```

`strncpy` on its own leaves a string that fills the buffer with no terminator, and the next `strlen` walks off the end looking for one. Copying one byte less than the room and writing the terminator into the last byte means the result is always a string, whatever came in. A `NULL` source empties the buffer rather than crashing, so a text setting with no default starts out empty.

**Cut by Bytes.** The cut counts bytes, not characters, so a character past ASCII that takes two or three bytes can be split at the end. The framework leaves that alone. A face's fonts carry only the characters it shows (see [Fonts](fonts.md)), so a character past ASCII draws as a box whether it arrives whole or split, and walking back to the start of the character would cost code for nothing.

**Text with Its Length in Front.** Calendar titles and places, and stock symbols, arrive in packed messages where the phone writes a length byte before each string (see [Message Formats](message-formats.md)). `copy_bounded` takes that length as the phone's word and the room as the watch's, copies whichever is smaller, and terminates. A buffer with no room at all is left alone, since one less than no room wraps round to 255 in an 8-bit count and would copy a quarter of a kilobyte over whatever follows.

## Telling Whether a Copy Changes Anything

The settings page sends every setting on every save, so the watch has to tell a real change from the same value sent again. For text, `cstring_fit_same` answers that by measuring the incoming string the way `cstring_fit` would cut it:

```c
size_t room = size - 1;
size_t incoming = strlen(value);
if (incoming > room)
{
    incoming = room;
}

return strlen(current) == incoming && strncmp(current, value, incoming) == 0;
```

Comparing the whole incoming string would count an over-long value as a change on every save, as [Settings on the Watch](settings-on-the-watch.md#taking-values-from-the-phone) shows with a long date format.

**On the Screen.** The engine keeps the last text each slot drew, and compares the new text with it on every repaint before copying it in. Most slots show the same string from one minute to the next, such as the date all day, so the fit to the slot's width and the relayout only run when the text really changed (see [The Engine](engine.md)).

## Printing Numbers

The watch has its own `snprintf`, built without floating point support, so a face cannot print a decimal with `%f`. A number with a decimal point rides as a whole number instead, and these helpers put the point in. They go through `snprintf` or `cstring_fit` at the end, so a buffer too small for the number gets a cut, terminated string rather than an overrun.

**Thousands.** `number_group` puts an apostrophe between each group of three digits, Swiss style, so 20358 steps reads `20'358`. A negative number keeps its minus.

**No Reading Yet.** The readouts share one marker for "nothing yet", a negative number. `fmt_int_or_dash` turns it into `--` and prints anything else through the format it is given:

```c
static void humidity_text(char *out, size_t n)
{
    fmt_int_or_dash(out, n, weather_store_humidity(), "%d%%");  // "64%", or "--"
}
```

The marker prints as `--` alone, not `--%`, since the format is never used for it.

**Prices in Hundredths.** The phone sends a price as whole hundredths, so 261.74 arrives as 26174 and never passes through a float. `fmt_hundredths` writes the sign out front on its own, then the whole part and the hundredths from the size of the number:

```c
const char *sign = value < 0 ? "-" : "";
unsigned int magnitude = magnitude_of(value);

snprintf(buffer, size, "%s%u.%02u", sign, magnitude / 100, magnitude % 100);
```

The obvious `"%d.%02d"` with `value / 100` and `value % 100` breaks on anything between -1 and 0. For -50 the whole part is 0, which carries no sign, and the remainder is -50, so it prints `0.-50`. Taking the sign out first gives `-0.50`. The size is worked out in unsigned maths, so even the most negative number an `int` holds prints correctly, which matters for a value that comes straight off the phone.

`fmt_pct_signed` does the same for a percent change and adds a plus for a gain, so 125 reads `+1.25%`, -7 reads `-0.07%`, and 0 reads `0.00%` with no sign at all. The plus lets the direction read even where the face does not colour it.

## Capital Letters

`text_to_upper` capitalizes a string in place, `a` to `z` only. Every date the framework's date readout builds goes through it after `strftime`, which writes month and day names such as `Thu` and `Jun` in mixed case. Face fonts are often cut down to capitals, digits, and a little punctuation, and a lowercase letter the font does not carry draws as a box. Anything past ASCII is left as it is.

## Checking Saved Text

`cstring_is_clean` and `cstring_setting_is_clean` check a saved string before the face sees it: it has to end inside its room, hold no control bytes, and say something unless its default is empty. [Settings on the Watch](settings-on-the-watch.md#cleaning-each-value) covers the rules and what happens to a string that fails.
