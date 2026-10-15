/**
 * @file layout_role.h
 * @brief Deprecated names for the day/night/Quiet Time picker that `role.h` provides.
 *
 * `role_pick` and `Role` in `role/role.h` do this job for any face, a layout editor or a themed
 * face alike. These names forward to them so a face on them keeps building. They go at the next
 * major release. Move to `role_pick` and `Role` when convenient.
 *
 * @ingroup lib_core
 */
#pragma once
#include "role/role.h"

/**
 * @addtogroup lib_core
 * @{
 */

/// @deprecated Use `Role`. The names line up one for one.
typedef Role LayoutRole;

/// @deprecated Use `ROLE_DAY`.
#define LAYOUT_ROLE_DAY ROLE_DAY
/// @deprecated Use `ROLE_NIGHT`.
#define LAYOUT_ROLE_NIGHT ROLE_NIGHT
/// @deprecated Use `ROLE_QUIET`.
#define LAYOUT_ROLE_QUIET ROLE_QUIET
/// @deprecated Use `ROLE_COUNT`.
#define LAYOUT_ROLE_COUNT ROLE_COUNT

/**
 * @brief Which layout wins. Forwards to `role_pick`.
 * @deprecated Call `role_pick`. The arguments are the same.
 *
 * @param quiet_on True while Quiet Time is on.
 * @param quiet_set True when a layout is assigned to Quiet Time.
 * @param night_on True while the night schedule says it is night.
 * @param night_set True when a layout is assigned to night.
 * @return The role whose layout should be drawn.
 */
LayoutRole layout_role_pick(bool quiet_on, bool quiet_set, bool night_on, bool night_set);

/** @} */
