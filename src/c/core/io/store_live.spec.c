/**
 * @file store_live.spec.c
 * @brief Host tests for whether a store runs live after a reconfigure.
 *
 * A face passes `live` true on every settings save. A pinned store that took it would start the
 * clock or fetch real readings over a screenshot fixture and spend a provider's quota. A live store
 * that ignored it would stay stopped once a save had stopped it. Both ways are pinned here, once for
 * every store that asks.
 */
#include "unity.h"

#include "io/store_live.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A pinned store stays off when a save asks for live, or a screenshot build fetches real readings. */
void test_a_pinned_store_stays_off_when_asked_for_live(void)
{
    bool result = store_live_after_reconfigure(true, true);

    TEST_ASSERT_FALSE(result);
}

/** @brief A live store asked for live runs, or a live face would stop on its first settings save. */
void test_a_live_store_asked_for_live_runs(void)
{
    bool result = store_live_after_reconfigure(true, false);

    TEST_ASSERT_TRUE(result);
}

/** @brief A live store asked to stop stops, since the rule only ever holds a store off. */
void test_a_live_store_asked_to_stop_stops(void)
{
    bool result = store_live_after_reconfigure(false, false);

    TEST_ASSERT_FALSE(result);
}

/** Unity needs each test naming, so a new one above is added here too. */
int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_a_pinned_store_stays_off_when_asked_for_live);
    RUN_TEST(test_a_live_store_asked_for_live_runs);
    RUN_TEST(test_a_live_store_asked_to_stop_stops);

    return UNITY_END();
}
