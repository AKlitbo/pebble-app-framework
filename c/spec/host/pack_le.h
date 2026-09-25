/**
 * @file pack_le.h
 * @brief Little-endian byte writers for the wire specs, so each one builds a message the way the
 * phone packs it.
 *
 * Specs only. The watch never writes these layouts, it only reads them, so nothing here belongs in
 * the shipped `bytes_le.h`. Every writer takes the offset to write at and hands back the offset just
 * past what it wrote, so a spec can chain them to build a message field by field.
 */
#pragma once
#include <stdint.h>
#include <string.h>

/**
 * @brief Writes one byte.
 *
 * @param buffer The message being built.
 * @param offset Where to write.
 * @param value The byte.
 * @return The offset just past it.
 */
static inline uint16_t put_u8(uint8_t *buffer, uint16_t offset, uint8_t value)
{
    buffer[offset++] = value;
    return offset;
}

/**
 * @brief Writes a signed 16-bit value, low byte first.
 *
 * @param buffer The message being built.
 * @param offset Where to write.
 * @param value The value.
 * @return The offset just past it.
 */
static inline uint16_t put_i16_le(uint8_t *buffer, uint16_t offset, int16_t value)
{
    uint16_t bits = (uint16_t)value;
    buffer[offset++] = bits & 0xFF;
    buffer[offset++] = (bits >> 8) & 0xFF;
    return offset;
}

/**
 * @brief Writes a signed 32-bit value, low byte first.
 *
 * @param buffer The message being built.
 * @param offset Where to write.
 * @param value The value.
 * @return The offset just past it.
 */
static inline uint16_t put_i32_le(uint8_t *buffer, uint16_t offset, int32_t value)
{
    uint32_t bits = (uint32_t)value;
    buffer[offset++] = bits & 0xFF;
    buffer[offset++] = (bits >> 8) & 0xFF;
    buffer[offset++] = (bits >> 16) & 0xFF;
    buffer[offset++] = (bits >> 24) & 0xFF;
    return offset;
}

/**
 * @brief Writes a string as a length byte and then its bytes, with no terminator, the way the phone
 * sends a symbol, a title, or a location.
 *
 * @param buffer The message being built.
 * @param offset Where to write.
 * @param text The string. Its length has to fit in one byte.
 * @return The offset just past it.
 */
static inline uint16_t put_text(uint8_t *buffer, uint16_t offset, const char *text)
{
    uint8_t len = (uint8_t)strlen(text);
    buffer[offset++] = len;
    memcpy(buffer + offset, text, len);
    return offset + len;
}
