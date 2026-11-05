/**
 * @file cstring_fit.h
 * @brief Copying text into a fixed buffer, and checking what a buffer holds before it is used.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Copy a string into a fixed buffer, keeping only what fits and always terminating it.
 *
 * The cut counts bytes, so a character that takes more than one byte can be split at it. The fonts
 * carry only the characters a face shows, which a character past ASCII is not, so it draws as a box
 * whether it is cut or whole, and walking back to a character boundary would cost bytes for nothing.
 *
 * @param dst The buffer to write into.
 * @param src The string to copy, or NULL to empty the buffer.
 * @param size The buffer's size, terminator included.
 */
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

/**
 * @brief Whether copying @p value into a buffer would leave it reading exactly as it does now.
 *
 * The copy keeps only what fits, so the incoming string is measured the same way. Comparing it in
 * full instead would call a value longer than the buffer a change every single time, which for a
 * settings field means re-reacting to a setting nobody touched.
 *
 * @param current What the buffer holds now.
 * @param value The string that would be copied in. Must not be NULL.
 * @param size The buffer's size, terminator included.
 * @return True when the copy would leave the buffer unchanged.
 */
static inline bool cstring_fit_same(const char *current, const char *value, size_t size)
{
    if (size == 0)
    {
        return true;  // nowhere to put it, so nothing about the buffer can move
    }

    size_t room = size - 1;
    size_t incoming = strlen(value);
    if (incoming > room)
    {
        incoming = room;
    }

    return strlen(current) == incoming && strncmp(current, value, incoming) == 0;
}

/**
 * @brief Copy bytes into a fixed buffer, taking what fits and terminating it.
 *
 * For the length-prefixed text the phone sends, where the length is the phone's word and the room
 * is ours. What does not fit is dropped rather than written past the end.
 *
 * @param[out] dst Where to write. Ends terminated whenever cap is at least 1.
 * @param cap How much room dst has, terminator included. A cap of 0 has no room even for the
 *   terminator, so dst is left untouched and not terminated.
 * @param src The bytes to copy.
 * @param len How many bytes there are.
 */
void copy_bounded(char *dst, uint8_t cap, const uint8_t *src, uint8_t len);

/**
 * @brief Whether a byte range holds a string worth keeping.
 *
 * Worth keeping means it ends inside its own room, it says something, and it carries no control
 * bytes. Everything from 0x20 up counts as text, UTF-8 included, so a place name spelled with an
 * umlaut is text and not damage. Getting that wrong is how a saved city turns back into the
 * default one on the next boot.
 *
 * @param s The bytes to look at.
 * @param size How much room they have.
 * @return Whether it reads as a string.
 */
bool cstring_is_clean(const char *s, uint16_t size);

/**
 * @brief Whether a saved text setting reads as one, where an empty setting can be the real value.
 *
 * A setting whose default is empty, such as a picker whose "None" is "", holds nothing on
 * purpose, so empty is a value for it and not damage. Any other setting keeps the cstring_is_clean
 * rule, since an empty one there is what a wiped blob reads like.
 *
 * @param s The bytes to look at.
 * @param size How much room they have.
 * @param default_str The setting's default, or NULL for none.
 * @return Whether the setting is worth keeping.
 */
bool cstring_setting_is_clean(const char *s, uint16_t size, const char *default_str);

/** @} */
