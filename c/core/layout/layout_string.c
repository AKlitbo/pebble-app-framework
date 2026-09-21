/**
 * @file layout_string.c
 * @brief Walking a layout wire string far enough to answer whether it holds anything.
 *
 * @ingroup lib_core
 */
#include "layout_string.h"

/** @brief Reads a run of digits and moves the cursor past them. Zero when there are none. */
static int parse_int(const char **p)
{
    int value = 0;
    while (**p >= '0' && **p <= '9')
    {
        value = value * 10 + (**p - '0');
        (*p)++;
    }

    return value;
}

bool layout_has_any_block(const char *layout, int type_count)
{
    for (const char *p = layout; p && *p; )
    {
        int type = parse_int(&p);
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
