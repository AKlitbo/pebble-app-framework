/**
 * @file cstring_fit.h
 * @brief Comparing a string against a fixed buffer it is about to be copied into.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Copy a string into a fixed buffer, keeping only what fits and always terminating it.
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

/** @} */
