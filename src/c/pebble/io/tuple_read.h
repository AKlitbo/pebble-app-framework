/**
 * @file tuple_read.h
 * @brief Reads a value out of an inbound message tuple.
 *
 * The SDK hands the phone's message over as tuples, each one a key, a type, a length, and the
 * bytes. This unwraps that shape and hands the bytes to wire_read.h, which owns the actual
 * reading. The split is the point: the tuple is the SDK's business and the width is not, and the
 * width is where the reading goes wrong.
 *
 * Everything that reads an inbound value goes through here. A decoder that unwraps a tuple itself
 * is trusting the type to tell it the width, which the type does not do.
 *
 * @ingroup lib_io
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_io
 * @{
 */

/**
 * @brief Reads an int tuple, whatever width the phone sent it at.
 *
 * A sender may pick TUPLE_INT or TUPLE_UINT for an integer, so both are accepted and the choice
 * only decides what the top bit means.
 *
 * @param tuple The tuple, or NULL when the key was absent.
 * @param fallback Returned when the tuple is absent, is not an int, or carries a width no sender
 *   may use.
 * @return The value, or @p fallback.
 */
int32_t tuple_int_or(const Tuple *tuple, int32_t fallback);

/**
 * @brief Reads a cstring tuple, or the fallback when it is not one that can be read.
 *
 * @param tuple The tuple, or NULL when the key was absent.
 * @param fallback Returned when the tuple is absent, is not a cstring, or carries no terminator
 *   inside its own length.
 * @return The string, or @p fallback.
 */
const char *tuple_str_or(const Tuple *tuple, const char *fallback);

/**
 * @brief Reads a whole number whether the phone sent it as an int or as text holding only digits.
 *
 * Clay sends a select as text and a toggle as an int, and a face's own component can send either,
 * so every toggle and choice reads through here and takes the value whichever way it came. An int
 * reads as tuple_int_or reads it. Text reads through wire_digits_or, so a sign, a space, or anything
 * after the digits gives the fallback, and digits too big for an int32_t read as INT32_MAX. A
 * colour stays on tuple_int_or, since its text could be hex and this would read it as decimal.
 *
 * @param tuple The tuple, or NULL when the key was absent.
 * @param fallback Returned when the tuple is absent, or is neither an int nor digits.
 * @return The value, or @p fallback.
 */
int32_t tuple_number_or(const Tuple *tuple, int32_t fallback);

/** @} */
