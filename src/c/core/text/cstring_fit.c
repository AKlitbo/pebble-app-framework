/**
 * @file cstring_fit.c
 * @brief Copying text into a fixed buffer, and checking what a buffer holds before it is used.
 *
 * @ingroup lib_core
 */
#include "text/cstring_fit.h"

void copy_bounded(char *dst, uint8_t cap, const uint8_t *src, uint8_t len)
{
    if (cap == 0)
    {
        // nowhere to even put the terminator. checked up front because cap - 1 below would wrap
        // to 255 through the int promotion and copy a quarter kilobyte over whatever is there
        return;
    }

    uint8_t copy = len;
    if (copy > cap - 1)
    {
        copy = cap - 1;
    }
    for (uint8_t c = 0; c < copy; c++)
    {
        dst[c] = (char)src[c];
    }
    dst[copy] = '\0';
}

bool cstring_is_clean(const char *s, uint16_t size)
{
    if (!s)
    {
        return false;
    }

    for (uint16_t i = 0; i < size; i++)
    {
        // plain char is signed on the host and unsigned on the watch, so read it as unsigned
        // to make the range test mean the same thing in a spec and on the wrist
        unsigned char c = (unsigned char)s[i];
        if (c == '\0')
        {
            return i > 0;  // ends inside its room, and said something on the way
        }

        // control bytes are what a damaged blob looks like. everything from 0x20 up is kept,
        // including UTF-8 lead and continuation bytes, so a place name like Zurich spelled with
        // an umlaut keeps its bytes across a reboot
        if (c < 0x20 || c == 0x7F)
        {
            return false;
        }
    }

    return false;  // ran out of room without ever ending
}

bool cstring_setting_is_clean(const char *s, uint16_t size, const char *default_str)
{
    bool empty_is_a_value = !default_str || default_str[0] == '\0';
    if (empty_is_a_value && s && size > 0 && s[0] == '\0')
    {
        return true;
    }

    return cstring_is_clean(s, size);
}
