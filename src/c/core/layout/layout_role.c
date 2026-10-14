/**
 * @file layout_role.c
 * @brief The deprecated `layout_role_pick`, forwarding to `role_pick`.
 *
 * @ingroup lib_core
 */
#include "layout_role.h"

LayoutRole layout_role_pick(bool quiet_on, bool quiet_set, bool night_on, bool night_set)
{
    return role_pick(quiet_on, quiet_set, night_on, night_set);
}
