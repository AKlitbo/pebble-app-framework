/**
 * @file wx_label.c
 * @brief The short word a small slot shows for the sky.
 *
 * @ingroup lib_core
 */
#include "weather/wx_label.h"

#include <string.h>

#define NIGHT_SUFFIX "_NIGHT"
#define NIGHT_SUFFIX_LEN 6

void wx_label_short(char *out, size_t n, const char *condition)
{
    if (n == 0)
    {
        return;
    }

    if (!condition || !condition[0])
    {
        condition = "UNKNOWN";
    }

    size_t len = strlen(condition);
    if (len > NIGHT_SUFFIX_LEN && !strcmp(condition + len - NIGHT_SUFFIX_LEN, NIGHT_SUFFIX))
    {
        len -= NIGHT_SUFFIX_LEN;
    }
    if (len >= n)
    {
        len = n - 1;
    }

    memcpy(out, condition, len);
    out[len] = '\0';
}
