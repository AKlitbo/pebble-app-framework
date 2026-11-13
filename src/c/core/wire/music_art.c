/**
 * @file music_art.c
 * @brief Checking the now playing art the phone sent, and laying its rows into a bitmap.
 *
 * @ingroup lib_core
 */
#include "wire/music_art.h"

#include <string.h>

bool music_art_read(const uint8_t *buf, uint16_t len, MusicArt *out)
{
    if (!buf || len < MUSIC_ART_HEADER)
    {
        return false;
    }

    uint8_t width = buf[0];
    uint8_t height = buf[1];
    uint8_t colours = buf[2];

    if (width == 0 || height == 0 || width > MUSIC_ART_SIDE_MAX || height > MUSIC_ART_SIDE_MAX)
    {
        return false;
    }

    if (colours == 0 || colours > MUSIC_ART_COLOURS_MAX)
    {
        return false;
    }

    // the length has to be exactly what the header says, since a short run would leave the bottom
    // rows reading past the message and a long one means the two sides disagree on the layout
    uint16_t row_bytes = (uint16_t)((width + 1) / 2);
    uint32_t want = (uint32_t)MUSIC_ART_HEADER + colours + (uint32_t)row_bytes * height;

    if (len != want)
    {
        return false;
    }

    out->width = width;
    out->height = height;
    out->colours = colours;
    out->palette = buf + MUSIC_ART_HEADER;
    out->pixels = buf + MUSIC_ART_HEADER + colours;
    out->row_bytes = row_bytes;
    return true;
}

void music_art_copy_rows(const MusicArt *art, uint8_t *dst, uint16_t dst_row_bytes)
{
    for (uint8_t row = 0; row < art->height; row++)
    {
        memcpy(dst + (uint32_t)row * dst_row_bytes, art->pixels + (uint32_t)row * art->row_bytes, art->row_bytes);
    }
}
