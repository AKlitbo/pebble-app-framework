/**
 * @file music_art.h
 * @brief Now playing art as the phone packs it, and the reader that checks it.
 *
 * The phone sends the art as one run of bytes on `MUSIC_ARTWORK`: [width][height][colours], then the
 * palette, one GColor8 byte per colour, then the pixels as the watch's own 4-bit palettized bitmap
 * holds them. Two pixels go to a byte with the even x in the high nibble, and each row is padded to
 * `(width + 1) / 2` bytes. A width or a height of 0 means no art. The bytes come off a phone, so none
 * of it is trusted, and a run whose length does not match its header is refused whole.
 *
 * The packer on the other side is ts/pkjs/wire.ts, and the two have to agree exactly.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

// MUSIC_ART_SIDE_MAX and MUSIC_ART_COLOURS_MAX are generated from the phone's cap table, so the two
// sides cannot drift
#include "wire/wire_caps.g.h"

/**
 * @addtogroup lib_core
 * @{
 */

/// The bytes in front of the palette: the width, the height, and how many colours follow
#define MUSIC_ART_HEADER 3

/**
 * @brief Art read off the wire. It points into the bytes it was read from, so it lives only as long
 * as they do.
 */
typedef struct
{
    uint8_t width;          ///< Width in pixels, 1 to MUSIC_ART_SIDE_MAX
    uint8_t height;         ///< Height in pixels, 1 to MUSIC_ART_SIDE_MAX
    uint8_t colours;        ///< How many palette entries follow, 1 to MUSIC_ART_COLOURS_MAX
    const uint8_t *palette; ///< One GColor8 byte for each colour
    const uint8_t *pixels;  ///< The rows, each row_bytes long
    uint16_t row_bytes;     ///< Bytes in one row of pixels, (width + 1) / 2
} MusicArt;

/**
 * @brief Reads art off the wire.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 * @param[out] out Receives the art. Untouched unless this returns true.
 * @return True for art the watch can draw. False for no art, and for a run that is short, long, or
 *   past either cap, which the store clears to as well.
 */
bool music_art_read(const uint8_t *buf, uint16_t len, MusicArt *out);

/**
 * @brief Copies the art's rows into a bitmap's own rows.
 *
 * A bitmap can pad each row past what the art needs, so each row goes to its own start.
 *
 * @param art The art read off the wire.
 * @param[out] dst The bitmap's first row.
 * @param dst_row_bytes How far apart the bitmap's rows sit, at least art->row_bytes.
 */
void music_art_copy_rows(const MusicArt *art, uint8_t *dst, uint16_t dst_row_bytes);

/** @} */
