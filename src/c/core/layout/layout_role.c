/**
 * @file layout_role.c
 * @brief The order the layout triggers are asked in.
 *
 * @ingroup lib_core
 */
#include "layout_role.h"

LayoutRole layout_role_pick(bool quiet_on, bool quiet_set, bool night_on, bool night_set)
{
    if (quiet_on && quiet_set)
    {
        return LAYOUT_ROLE_QUIET;
    }

    if (night_on && night_set)
    {
        return LAYOUT_ROLE_NIGHT;
    }

    return LAYOUT_ROLE_DAY;
}
