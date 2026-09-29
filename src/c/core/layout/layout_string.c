/**
 * @file layout_string.c
 * @brief Walking a layout wire string far enough to answer whether it holds anything.
 *
 * @ingroup lib_core
 */
#include "layout_string.h"

int layout_parse_int(const char **cursor)
{
    int value = 0;
    bool too_big = false;

    // every digit is walked even once the number is too big, so the cursor still lands on the
    // next field. stopping the maths at the cap keeps an int from ever overflowing
    while (**cursor >= '0' && **cursor <= '9')
    {
        if (value > LAYOUT_INT_MAX / 10)
        {
            too_big = true;
        }
        else
        {
            value = value * 10 + (**cursor - '0');
            too_big = too_big || value > LAYOUT_INT_MAX;
        }
        (*cursor)++;
    }

    return too_big ? -1 : value;
}

bool layout_has_any_block(const char *layout, int type_count)
{
    for (const char *p = layout; p && *p; )
    {
        int type = layout_parse_int(&p);
        if (type > 0 && type < type_count)
        {
            return true;
        }

        // this record is no good, so skip to the start of the next one
        while (*p && *p != ';')
        {
            p++;
        }
        if (*p == ';')
        {
            p++;
        }
    }

    return false;
}
