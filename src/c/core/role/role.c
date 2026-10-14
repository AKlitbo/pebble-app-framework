/**
 * @file role.c
 * @brief The order the day, night, and Quiet Time triggers are asked in.
 *
 * @ingroup lib_core
 */
#include "role.h"

Role role_pick(bool quiet_on, bool quiet_set, bool night_on, bool night_set)
{
    if (quiet_on && quiet_set)
    {
        return ROLE_QUIET;
    }

    if (night_on && night_set)
    {
        return ROLE_NIGHT;
    }

    return ROLE_DAY;
}
