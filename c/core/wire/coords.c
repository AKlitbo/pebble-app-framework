/**
 * @file coords.c
 * @brief Telling a real fix from the phone's way of saying it has none.
 *
 * @ingroup lib_core
 */
#include "wire/coords.h"

/**
 * @brief Whether a string carries at least one digit.
 *
 * A digit is the whole tell, so this walks for one rather than calling strpbrk. The tree has one
 * other caller of that family and it drags a few hundred bytes of libc in behind it.
 *
 * @param s The string to check, or NULL.
 * @return Whether it holds a digit.
 */
static bool has_digit(const char *s)
{
    if (!s)
    {
        return false;
    }

    for (; *s; s++)
    {
        if (*s >= '0' && *s <= '9')
        {
            return true;
        }
    }
    return false;
}

bool coords_look_real(const char *lat, const char *lon)
{
    return has_digit(lat) && has_digit(lon);
}
