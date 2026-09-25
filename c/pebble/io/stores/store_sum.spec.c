/**
 * @file store_sum.spec.c
 * @brief Host tests for the checksum the stores compare before saving.
 *
 * The stores skip a flash write when the sum of a reading matches the one they last wrote. So the
 * cases worth pinning are the two ways that goes wrong. A new sync time on its own must not count
 * as a change, or every poll writes again. A real change, even one byte or two values trading
 * places, must count, or the new reading is lost on the next relaunch.
 */
#include "unity.h"

#include <string.h>
#include <time.h>

#include "io/stores/store_sum.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A blob shaped like a store's: a tag, the reading, and the sync time last. */
typedef struct
{
    uint8_t tag;
    int16_t temp;
    char    cond[8];
    time_t  last_sync;
} Blob;

/** @brief A blob with a reading in it, zeroed first so its padding is the same every time. */
static Blob blob(int16_t temp, const char *cond, time_t last_sync)
{
    Blob out;
    memset(&out, 0, sizeof(out));
    out.tag = 0x12;
    out.temp = temp;
    strncpy(out.cond, cond, sizeof(out.cond) - 1);
    out.last_sync = last_sync;
    return out;
}

/** @brief The reading size stops at the sync time, so the sync time is left out of the sum. */
void test_reading_size_stops_at_the_sync_time(void)
{
    Blob state = blob(21, "SUNNY", 1000);

    size_t result = STORE_READING_SIZE(state, last_sync);

    TEST_ASSERT_EQUAL_UINT(offsetof(Blob, last_sync), result);
}

/**
 * @brief A reply that only moved the sync time sums the same, so it is not written again.
 *
 * Every reply stamps a new sync time. Counting it would put every poll back on flash, which is the
 * wear this exists to stop.
 */
void test_a_new_sync_time_alone_is_not_a_change(void)
{
    Blob saved = blob(21, "SUNNY", 1000);
    Blob next = blob(21, "SUNNY", 2800);

    uint32_t result = store_sum(&next, STORE_READING_SIZE(next, last_sync));

    TEST_ASSERT_EQUAL_UINT32(store_sum(&saved, STORE_READING_SIZE(saved, last_sync)), result);
}

/** @brief One degree of difference is a new reading, so it has to be saved. */
void test_a_changed_reading_sums_differently(void)
{
    Blob saved = blob(21, "SUNNY", 1000);
    Blob next = blob(22, "SUNNY", 1000);

    uint32_t result = store_sum(&next, STORE_READING_SIZE(next, last_sync));

    TEST_ASSERT_NOT_EQUAL_UINT32(store_sum(&saved, STORE_READING_SIZE(saved, last_sync)), result);
}

/**
 * @brief Two bytes trading places is a change too.
 *
 * A plain byte total gives the same answer for both orders, so a forecast that only swapped two
 * hours would never be saved.
 */
void test_two_bytes_trading_places_sum_differently(void)
{
    const uint8_t before[] = {1, 2};
    const uint8_t after[] = {2, 1};

    uint32_t result = store_sum(after, sizeof(after));

    TEST_ASSERT_NOT_EQUAL_UINT32(store_sum(before, sizeof(before)), result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_reading_size_stops_at_the_sync_time);
    RUN_TEST(test_a_new_sync_time_alone_is_not_a_change);
    RUN_TEST(test_a_changed_reading_sums_differently);
    RUN_TEST(test_two_bytes_trading_places_sum_differently);
    return UNITY_END();
}
