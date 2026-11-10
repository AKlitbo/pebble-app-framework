/**
 * @file wire_read.h
 * @brief Reads the values the phone packs into a message.
 *
 * The phone is free to send an integer one, two, or four bytes wide, and it says which by the
 * length it puts beside the value rather than by the type. The values sit back to back with
 * nothing between them, so a reader that takes the type's word for the width and grabs four bytes
 * off a one-byte value walks straight into whatever is packed behind it. That is what these are
 * for: the width decides how many bytes get read, and anything else is refused. A number sent as
 * text is read here too, so a setting takes it whichever way the phone sent it.
 *
 * Header only on purpose. There is one caller on the watch (tuple_read.c), so each body folds into
 * it and nothing is spent on getting there.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

#include "io/bytes_le.h"

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Reads a little-endian integer of exactly @p length bytes.
 *
 * @param is_signed Whether the value is signed. Decides only what the top bit means.
 * @param length How many bytes the value occupies. 1, 2, and 4 are the widths a sender may use,
 *   and anything else is refused rather than guessed at.
 * @param value The first byte of the value.
 * @param fallback Returned when the width is not one a sender may use, or there is no value.
 * @return The value, or @p fallback.
 */
static inline int32_t wire_int_or(bool is_signed, uint16_t length, const uint8_t *value, int32_t fallback)
{
    if (!value)
    {
        return fallback;
    }

    switch (length)
    {
        // a byte read signed is -128 to 127 and unsigned is 0 to 255
        // that is the only thing the signedness decides at this width
        case 1: return is_signed ? (int32_t)(int8_t)value[0] : (int32_t)value[0];

        // read the pair as signed and take the sign back off when it is not wanted
        // so the unsigned half lands on 0 to 65535 rather than going negative at the top
        case 2: return is_signed ? (int32_t)read_i16_le(value)
                                 : (int32_t)(uint16_t)read_i16_le(value);

        // four bytes fill the whole width either way so the bits are the same
        // and only the caller's reading of the top one differs
        case 4: return read_i32_le(value);

        default: return fallback;
    }
}

/**
 * @brief Whether a string of @p length bytes carries its terminator inside itself.
 *
 * A sender is supposed to include the terminator and nothing re-checks that it did. A string
 * without one is not a string: reading it runs on past the end looking for a zero byte that
 * belongs to something else, or to nothing at all.
 *
 * @param s The first byte of the string.
 * @param length How many bytes the string occupies, terminator included.
 * @return Whether it is safe to read as a C string.
 */
static inline bool wire_cstring_terminated(const char *s, uint16_t length)
{
    return s && length > 0 && s[length - 1] == '\0';
}

/**
 * @brief Reads text holding only digits as the whole number it spells, such as a select's "3".
 *
 * Clay sends a select's value as text, so a choice of 3 arrives as "3". One or more digits and
 * nothing else is a number. A sign, a space at either end, or anything after the digits gives the
 * fallback, so "3a" is turned away rather than read as 3.
 *
 * A run of digits too big for an int32_t is still a number, just a big one, so it reads as
 * INT32_MAX. That keeps it apart from the fallback, and a choice then takes it the way it takes
 * "300", as past the end of its list.
 *
 * @param text The text, already checked to end inside its own length, or NULL.
 * @param fallback Returned when there is no text, or it holds anything but digits.
 * @return The number, INT32_MAX for digits past it, or @p fallback.
 */
static inline int32_t wire_digits_or(const char *text, int32_t fallback)
{
    if (!text || text[0] == '\0')
    {
        return fallback;
    }

    int32_t value = 0;
    for (const char *cursor = text; *cursor != '\0'; cursor++)
    {
        if (*cursor < '0' || *cursor > '9')
        {
            return fallback;
        }

        int32_t digit = *cursor - '0';

        // held at the top before the next digit goes on, since a sum past INT32_MAX is undefined
        // in C. the walk carries on so a letter further along still turns the text away
        if (value > (INT32_MAX - digit) / 10)
        {
            value = INT32_MAX;
            continue;
        }

        value = value * 10 + digit;
    }

    return value;
}

/** @} */
