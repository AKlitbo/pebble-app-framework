/**
 * @file icons.c
 * @brief Weather-icon resource lookup implementation.
 *
 * The token-to-resource table lives in `icons_table.g.h`, generated from the shared
 * vocabulary in `ts/weather/conditions.ts` by the framework repo's `tools/build-conditions.ts`.
 *
 * @ingroup lib_ui
 */
#include "ui/weather/icons.h"

// gated on HAS_WEATHER_ICONS, which the waf build's paf_features.py defines when the face declares the
// weather icon set. the generated tables reference RESOURCE_ID_ICON_WEATHER_NOW_*,
// so a face that does not draw weather icons, and so does not ship those resources, compiles
// this as an empty unit instead of failing on undeclared resource ids. only the face's own code,
// or a family's shared code, calls these, so a face that draws icons defines the flag by shipping
// the icons
#if defined(HAS_WEATHER_ICONS)

#include "ui/weather/icons_table.g.h"

uint32_t wx_resource_for(const char *condition)
{
    return wx_resource_for_table(condition);
}

#endif  // HAS_WEATHER_ICONS
