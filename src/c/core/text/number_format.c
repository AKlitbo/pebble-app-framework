/**
 * @file number_format.c
 * @brief Pure number formatting, no SDK behind it.
 *
 * @ingroup lib_core
 */
#include "text/number_format.h"
#include "text/cstring_fit.h"

#include <stdio.h>
#include <string.h>

/**
 * @brief The size of a number without its sign, as an unsigned value.
 *
 * abs() on INT_MIN has no answer that fits an int, and the stock price comes straight off the wire.
 * Doing the negation in unsigned maths gives the right size for every int, INT_MIN included.
 *
 * @param value The number to take the size of.
 * @return The value with its sign dropped.
 */
static unsigned int magnitude_of(int value)
{
    return value < 0 ? 0u - (unsigned int)value : (unsigned int)value;
}

void number_group(char *buffer, size_t size, int value)
{
    if (size == 0)
    {
        return;
    }

    // strip the sign into an unsigned magnitude so INT_MIN stays well-defined
    // then walk the digits inserting separators
    char digits[16];
    snprintf(digits, sizeof(digits), "%u", magnitude_of(value));

    size_t len = strlen(digits);
    char out[24];
    size_t w = 0;

    if (value < 0 && w < sizeof(out) - 1)
    {
        out[w++] = '-';
    }

    for (size_t i = 0; i < len && w < sizeof(out) - 1; i++)
    {
        // a separator precedes every group of three counted from the right
        if (i > 0 && (len - i) % 3 == 0)
        {
            out[w++] = '\'';
        }

        if (w < sizeof(out) - 1)
        {
            out[w++] = digits[i];
        }
    }

    out[w] = '\0';

    cstring_fit(buffer, out, size);
}

void fmt_int_or_dash(char *buffer, size_t size, int value, const char *fmt)
{
    if (value < 0)
    {
        snprintf(buffer, size, "--");
    }
    else
    {
        snprintf(buffer, size, fmt, value);
    }
}

void fmt_hundredths(char *buffer, size_t size, int value)
{
    // pull the sign out front so a value between -1 and 0 still shows the minus, since the whole
    // part would be 0 and would otherwise drop it
    const char *sign = value < 0 ? "-" : "";
    unsigned int magnitude = magnitude_of(value);

    snprintf(buffer, size, "%s%u.%02u", sign, magnitude / 100, magnitude % 100);
}

void fmt_pct_signed(char *buffer, size_t size, int value)
{
    // same reason as above, plus a gain wears its plus so the direction reads without the colour
    const char *sign = value > 0 ? "+" : (value < 0 ? "-" : "");
    unsigned int magnitude = magnitude_of(value);

    snprintf(buffer, size, "%s%u.%02u%%", sign, magnitude / 100, magnitude % 100);
}
