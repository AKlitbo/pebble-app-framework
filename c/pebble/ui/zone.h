/**
 * @file zone.h
 * @brief Layout primitives. Defines paintable areas and their text alignments.
 *
 * @ingroup lib_ui
 */
#pragma once
#include <pebble.h>

#include "ui/fonts.h"

/**
 * @addtogroup lib_ui
 * @{
 */

/**
 * @brief Everything needed to present one text slot. Where it sits, and which registered font,
 * alignment, and colour to use, plus up to two smaller font and rect tiers to step down to when
 * the text would overflow.
 *
 * A face declares a static const table of these, and the engine loops it to build the text
 * layers.
 */
typedef struct
{
    GRect          rect;              ///< Area for the main font
    FontId         font_id;           ///< The main font to try first
    GTextAlignment align;             ///< Text alignment, used at every tier
    GColor         color;             ///< Text colour, used at every tier
    FontId         font_id_fallback;  ///< First smaller font to try when the text overflows the main one
    GRect          rect_fallback;     ///< Area for the first smaller font
    FontId         font_id_fallback2; ///< Second smaller font for the widest strings
    GRect          rect_fallback2;    ///< Area for the second smaller font. Leave it zero-sized to skip this step
    FontId         font_id_fallback3; ///< Third smaller font for the widest strings of all
    GRect          rect_fallback3;    ///< Area for the third smaller font. Leave it zero-sized to skip this step
} Zone;

/**
 * @brief Creates a transparent text layer for a zone and attaches it to the parent layer.
 *
 * @param parent The parent layer.
 * @param zone The zone properties.
 * @return The new text layer, or NULL when the heap had no room for it. A caller holding NULL
 *   has an empty slot, so it must check before passing the layer back in.
 */
TextLayer *zone_make_layer(Layer *parent, const Zone *zone);

/**
 * @brief Sets a text layer's text, stepping down through the zone's font tiers to find one
 * the text fits in.
 *
 * It tries the main tier first, then each fallback tier in order, and uses the largest one
 * whose text fits. A face skips a tier by leaving its rect zero-sized, since a zero-filled
 * struct already reads that way. The main tier always exists. If the text fits nowhere, the
 * smallest defined tier wins and the text layer trails an ellipsis as a last resort.
 *
 * @param layer The text layer.
 * @param zone The zone specifying the fallback fonts and rects.
 * @param text The text to set.
 */
void zone_set_text_fit(TextLayer *layer, const Zone *zone, const char *text);

/** @} */
