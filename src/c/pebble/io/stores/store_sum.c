/**
 * @file store_sum.c
 * @brief The checksum the stores compare before saving, in one copy every store links against.
 *
 * @ingroup lib_stores
 */
#include "io/stores/store_sum.h"

uint32_t store_sum(const void *bytes, size_t size)
{
    // FNV-1a. each byte is mixed in turn, so the order of the bytes counts as well as their values
    const uint8_t *byte = (const uint8_t *)bytes;
    uint32_t sum = 2166136261u;
    for (size_t i = 0; i < size; i++)
    {
        sum ^= byte[i];
        sum *= 16777619u;
    }
    return sum;
}
