/**
 * @file wx_label.c
 * @brief The short word a small slot shows for the sky.
 *
 * @ingroup lib_core
 */
#include "weather/wx_label.h"

#include <string.h>

#include "weather/wx_cond.g.h"

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
    if (len > WX_COND_NIGHT_LEN && !strcmp(condition + len - WX_COND_NIGHT_LEN, WX_COND_NIGHT_ENDING))
    {
        len -= WX_COND_NIGHT_LEN;
    }
    if (len >= n)
    {
        len = n - 1;
    }

    memcpy(out, condition, len);
    out[len] = '\0';
}
