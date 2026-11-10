/**
 * @file wx_cond.c
 * @brief Turns the condition token the phone sends into its WxCond.
 *
 * @ingroup lib_core
 */
#include "weather/wx_cond.h"

#include <string.h>

#define TOKEN_ROW(name) [WX_COND_##name] = #name, ///< One condition's name as its token

/**
 * @brief Each condition's token in a fixed width row, indexed by its WxCond. The rows are plain bytes
 * rather than pointers, so the watch has no pointer per token to fix up when it loads the app.
 */
static const char s_tokens[WX_COND_COUNT][WX_COND_TOKEN_LEN] = {WX_COND_EACH(TOKEN_ROW)};

WxCond wx_cond_parse(const char *token, bool *night)
{
    if (night)
    {
        *night = false;
    }

    if (!token)
    {
        return WX_COND_UNKNOWN;
    }

    size_t len = strlen(token);
    bool dark = len > WX_COND_NIGHT_LEN && !strcmp(token + len - WX_COND_NIGHT_LEN, WX_COND_NIGHT_ENDING);
    if (dark)
    {
        len -= WX_COND_NIGHT_LEN;
    }

    // a token too long for a row cannot be one, and checking first keeps the end check inside the row
    if (len == 0 || len >= WX_COND_TOKEN_LEN)
    {
        return WX_COND_UNKNOWN;
    }

    for (int i = 0; i < WX_COND_COUNT; i++)
    {
        if (!strncmp(s_tokens[i], token, len) && s_tokens[i][len] == '\0')
        {
            if (night)
            {
                *night = dark;
            }
            return (WxCond)i;
        }
    }

    return WX_COND_UNKNOWN;
}
