/**
 * @file time_config.spec.c
 * @brief Host tests for what a time store reconfigure runs and whether two sets of its rules run
 * the same tickers.
 *
 * A face hands the time store its rules on every settings save. The store skips the save when the
 * tickers would not change, since subscribing the tick again makes PebbleOS send a first tick, and
 * that tick repaints the face and gives every store another poll check. So a save that changes a
 * ticker has to read as different, or the face keeps the old cadence. A save that only flips a field
 * with no effect has to read as the same, or the extra tick comes back.
 *
 * Before either, the save's `live` is held off on a store init started frozen or never started. A
 * face passes `live` true on every save, so without that a screenshot build would have the real time
 * back at the next tick, while a live face has to get its rules through as it passed them. The two
 * steps only work in that order, so time_config_reconfigure runs them together the way the store
 * does, and its tests pin the pair.
 */
#include "unity.h"

#include "clock/time_config.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief The rules a clock face runs, the minute tick alone. */
static const TimeConfig CLOCK = {.live = true, .minute_tick = true, .beats = false, .hourly = false};

/** @brief A save that changes nothing runs the same tickers, so it costs no extra tick. */
void test_time_config_same_tickers_for_the_same_rules(void)
{
    bool result = time_config_same_tickers(CLOCK, CLOCK);

    TEST_ASSERT_TRUE(result);
}

/** @brief With the minute tick on, the hourly buzz setting changes no ticker, so flipping it costs no tick. */
void test_time_config_ignores_hourly_beside_the_minute_tick(void)
{
    TimeConfig hourly = CLOCK;
    hourly.hourly = true;

    bool result = time_config_same_tickers(CLOCK, hourly);

    TEST_ASSERT_TRUE(result);
}

/** @brief On a .beats clock hourly adds the hour tick, or the hourly buzz would never land. */
void test_time_config_counts_hourly_without_the_minute_tick(void)
{
    TimeConfig beats = {.live = true, .minute_tick = false, .beats = true, .hourly = false};
    TimeConfig beats_hourly = beats;
    beats_hourly.hourly = true;

    bool result = time_config_same_tickers(beats, beats_hourly);

    TEST_ASSERT_FALSE(result);
}

/** @brief Switching the time format to .beats swaps the ticker, or the face keeps ticking by the minute. */
void test_time_config_counts_a_format_switch(void)
{
    TimeConfig beats = {.live = true, .minute_tick = false, .beats = true, .hourly = false};

    bool result = time_config_same_tickers(CLOCK, beats);

    TEST_ASSERT_FALSE(result);
}

/** @brief Adding the .beats timer beside the minute tick has to start it, or a live .beats readout freezes. */
void test_time_config_counts_the_beats_timer_alone(void)
{
    TimeConfig both = CLOCK;
    both.beats = true;

    bool result = time_config_same_tickers(CLOCK, both);

    TEST_ASSERT_FALSE(result);
}

/** @brief Turning live back on has to start the tickers again, or a clock a reconfigure stopped stays stopped. */
void test_time_config_counts_live_turning_on(void)
{
    TimeConfig frozen = CLOCK;
    frozen.live = false;

    bool result = time_config_same_tickers(frozen, CLOCK);

    TEST_ASSERT_FALSE(result);
}

/** @brief With live off nothing runs, so the other fields changing under it starts nothing. */
void test_time_config_ignores_the_rest_while_frozen(void)
{
    TimeConfig frozen = {.live = false, .minute_tick = true, .beats = false, .hourly = false};
    TimeConfig frozen_beats = {.live = false, .minute_tick = false, .beats = true, .hourly = true};

    bool result = time_config_same_tickers(frozen, frozen_beats);

    TEST_ASSERT_TRUE(result);
}

/** @brief A save asking for live on a clock pinned for screenshots keeps it pinned, or the real time comes back. */
void test_time_config_reconfigured_keeps_a_frozen_store_frozen(void)
{
    TimeConfig result = time_config_reconfigured(CLOCK, true);

    TEST_ASSERT_FALSE(result.live);
}

/** @brief A live face's rules go through as it passed them, or a save would change the tickers it runs. */
void test_time_config_reconfigured_passes_a_live_store_its_rules(void)
{
    TimeConfig beats = {.live = true, .minute_tick = false, .beats = true, .hourly = true};

    TimeConfig result = time_config_reconfigured(beats, false);

    TEST_ASSERT_TRUE(result.live);
    TEST_ASSERT_FALSE(result.minute_tick);
    TEST_ASSERT_TRUE(result.beats);
    TEST_ASSERT_TRUE(result.hourly);
}

/** @brief A live store still stops when a save asks it to, since the rule only ever holds a clock frozen. */
void test_time_config_reconfigured_still_stops_a_live_store(void)
{
    TimeConfig frozen = CLOCK;
    frozen.live = false;

    TimeConfig result = time_config_reconfigured(frozen, false);

    TEST_ASSERT_FALSE(result.live);
}

/**
 * @brief A save handing a pinned .beats clock live rules reads as no change, so no ticker starts.
 *
 * Compared before the hold, the save's `live` true would read as a change and the store would start
 * the tickers its seed is pinned against.
 */
void test_time_config_reconfigure_leaves_a_pinned_beats_clock_alone(void)
{
    TimeConfig running = {.live = false, .minute_tick = false, .beats = true, .hourly = false};
    TimeConfig asked = {.live = true, .minute_tick = false, .beats = true, .hourly = false};

    bool result = time_config_reconfigure(&running, asked, true);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_FALSE(running.live);
}

/** @brief A store the face never started stays off when a save hands it a clock, so no tick runs for it. */
void test_time_config_reconfigure_leaves_a_store_never_started_alone(void)
{
    TimeConfig running = {.live = false};

    bool result = time_config_reconfigure(&running, CLOCK, true);

    TEST_ASSERT_FALSE(result);
}

/** @brief A live clock stopped by one save and started by the next swaps its tickers both times. */
void test_time_config_reconfigure_stops_and_restarts_a_live_clock(void)
{
    TimeConfig running = CLOCK;
    TimeConfig frozen = CLOCK;
    frozen.live = false;

    bool stopped = time_config_reconfigure(&running, frozen, false);
    bool restarted = time_config_reconfigure(&running, CLOCK, false);

    TEST_ASSERT_TRUE(stopped);
    TEST_ASSERT_TRUE(restarted);
    TEST_ASSERT_TRUE(running.live);
}

/** @brief A live clock handed the rules it already runs reads as no change, so the save costs no tick. */
void test_time_config_reconfigure_skips_the_same_rules(void)
{
    TimeConfig running = CLOCK;

    bool result = time_config_reconfigure(&running, CLOCK, false);

    TEST_ASSERT_FALSE(result);
}

/** Unity needs each test naming, so a new one above is added here too. */
int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_time_config_same_tickers_for_the_same_rules);
    RUN_TEST(test_time_config_ignores_hourly_beside_the_minute_tick);
    RUN_TEST(test_time_config_counts_hourly_without_the_minute_tick);
    RUN_TEST(test_time_config_counts_a_format_switch);
    RUN_TEST(test_time_config_counts_the_beats_timer_alone);
    RUN_TEST(test_time_config_counts_live_turning_on);
    RUN_TEST(test_time_config_ignores_the_rest_while_frozen);
    RUN_TEST(test_time_config_reconfigured_keeps_a_frozen_store_frozen);
    RUN_TEST(test_time_config_reconfigured_passes_a_live_store_its_rules);
    RUN_TEST(test_time_config_reconfigured_still_stops_a_live_store);
    RUN_TEST(test_time_config_reconfigure_leaves_a_pinned_beats_clock_alone);
    RUN_TEST(test_time_config_reconfigure_leaves_a_store_never_started_alone);
    RUN_TEST(test_time_config_reconfigure_stops_and_restarts_a_live_clock);
    RUN_TEST(test_time_config_reconfigure_skips_the_same_rules);

    return UNITY_END();
}
