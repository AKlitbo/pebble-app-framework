/**
 * @file weather_reading.spec.c
 * @brief Host tests for turning one weather message into the kept reading.
 *
 * Every weather panel reads what this leaves behind, and the phone leaves out any value it has
 * none for. What is worth pinning is how a message that is only part filled lands: a failed fetch
 * must keep the last good temperature, a group that arrived must blank the readings it left out
 * rather than show stale ones beside fresh ones, a group that never arrived must leave its readings
 * alone, and a real negative temperature must never be mistaken for a missing one.
 */
#include "unity.h"

#include <limits.h>
#include <string.h>

#include "weather/weather_reading.h"

void setUp(void) {}
void tearDown(void) {}

/** The kept weather a watch holds after an earlier good reading, so a message has something to change. */
static WeatherState held(void)
{
    WeatherState state;
    memset(&state, 0, sizeof(state));
    state.temp = 21;
    strcpy(state.cond, "SUNNY");
    state.humidity = 40;
    state.wind_kmh = 12;
    strcpy(state.wind_dir, "NW");
    state.sunrise = 6 * 60 + 30;
    state.sunset = 21 * 60 + 30;
    state.uv = 5;
    state.temp_max = 25;
    state.temp_min = 12;
    state.precip_chance = 10;
    state.feels_like = 20;
    state.pressure = 1013;
    state.dew_point = 8;
    state.last_sync = 500;
    return state;
}

/** A message with every group empty, which each test fills in only as far as it needs. */
static WeatherMessage empty_message(void)
{
    WeatherMessage msg;
    memset(&msg, 0, sizeof(msg));
    msg.temp = INT_MIN;
    msg.humidity = INT_MIN;
    msg.wind_kmh = INT_MIN;
    msg.uv = INT_MIN;
    msg.temp_max = INT_MIN;
    msg.temp_min = INT_MIN;
    msg.precip_chance = INT_MIN;
    msg.feels_like = INT_MIN;
    msg.pressure = INT_MIN;
    msg.dew_point = INT_MIN;
    msg.sunrise = INT_MIN;
    msg.sunset = INT_MIN;
    return msg;
}

/**
 * The clock at 14:20:30 on a Wednesday, with midnight at 100000, for a message landing at 900 seconds
 * into the test's own timeline. The two do not have to agree, since apply only adds to them.
 */
static const WeatherClock AFTERNOON = {
    .now = 900, .day_start = 100000, .hour = 14, .minute = 20, .second = 30, .wday = 3,
};

/** @brief A failed fetch keeps the last good temperature and sky rather than showing 0 degrees. */
void test_a_failed_fetch_keeps_the_last_reading(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_CURRENT;
    msg.ok = false;
    msg.temp = 0;
    msg.cond = "No GPS";

    bool result = weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_INT(21, state.temp);
    TEST_ASSERT_EQUAL_STRING("SUNNY", state.cond);
    TEST_ASSERT_EQUAL_INT(500, (int)state.last_sync);
}

/** @brief A good reading replaces the temperature and sky and stamps the sync time. */
void test_a_good_reading_is_kept_and_stamped(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_CURRENT;
    msg.ok = true;
    msg.temp = 14;
    msg.cond = "RAIN";

    bool result = weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(14, state.temp);
    TEST_ASSERT_EQUAL_STRING("RAIN", state.cond);
    TEST_ASSERT_EQUAL_INT(900, (int)state.last_sync);
}

/** @brief A corrupt temperature is pinned to -99 to 199, so it cannot overflow the int16 or draw absurd. */
void test_a_temperature_out_of_range_is_clamped(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_CURRENT;
    msg.ok = true;
    msg.temp = 40000;
    msg.cond = "SUNNY";

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(199, state.temp);
}

/** @brief A forecast group missing one reading blanks it, so today's low never sits beside a stale high. */
void test_a_group_blanks_the_readings_it_left_out(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_FORECAST;
    msg.temp_max = 18;

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(18, state.temp_max);
    TEST_ASSERT_EQUAL_INT(WEATHER_NO_TEMP, state.temp_min);
    TEST_ASSERT_EQUAL_INT(-1, state.uv);
    TEST_ASSERT_EQUAL_INT(-1, state.precip_chance);
}

/** @brief A missing extra string reads empty, so the panel shows its placeholder rather than old text. */
void test_a_missing_extra_string_reads_empty(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_EXTRA;
    msg.humidity = 55;

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(55, state.humidity);
    TEST_ASSERT_EQUAL_INT(-1, state.wind_kmh);
    TEST_ASSERT_EQUAL_STRING("", state.wind_dir);
    TEST_ASSERT_EQUAL_INT(-1, state.sunrise);
}

/** @brief A group that never arrived leaves its readings alone, since a face may not declare its keys at all. */
void test_a_group_that_did_not_arrive_is_left_alone(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_AIR;
    msg.feels_like = 19;

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(40, state.humidity);
    TEST_ASSERT_EQUAL_INT(25, state.temp_max);
    TEST_ASSERT_EQUAL_INT(19, state.feels_like);
}

/** @brief A real negative reading is kept, since only INT_MIN marks a missing one. */
void test_a_negative_reading_is_kept(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_FORECAST | WEATHER_GROUP_AIR;
    msg.temp_min = -5;
    msg.dew_point = -12;

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(-5, state.temp_min);
    TEST_ASSERT_EQUAL_INT(-12, state.dew_point);
}

/** @brief A strip that does not read clean keeps the last good row and counts as nothing kept. */
void test_a_bad_strip_keeps_the_last_row(void)
{
    WeatherState state = held();
    state.hourly.count = 3;
    const uint8_t cut_short[] = {8, 14, 2, 1};
    WeatherMessage msg = empty_message();
    msg.hourly = cut_short;
    msg.hourly_len = sizeof(cut_short);

    bool result = weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_UINT8(3, state.hourly.count);
}

/**
 * @brief A Celsius reading converts to Fahrenheit when the wearer switches.
 *
 * Switching units with the phone offline showed 23F for 23 degrees Celsius.
 */
void test_a_celsius_reading_converts_to_fahrenheit(void)
{
    WeatherState state = held();
    state.temp = 23;

    weather_reading_convert(&state, true);

    TEST_ASSERT_EQUAL_INT(73, state.temp);
}

/** @brief Switching back brings a Fahrenheit reading to Celsius. */
void test_a_fahrenheit_reading_converts_back_to_celsius(void)
{
    WeatherState state = held();
    state.temp = 73;

    weather_reading_convert(&state, false);

    TEST_ASSERT_EQUAL_INT(23, state.temp);
}

/** @brief A reading below zero rounds to the nearest degree rather than toward zero. */
void test_a_below_zero_reading_rounds_to_the_nearest_degree(void)
{
    WeatherState state = held();
    state.temp = -5;
    state.temp_min = 0;

    weather_reading_convert(&state, false);

    TEST_ASSERT_EQUAL_INT(-21, state.temp);
    TEST_ASSERT_EQUAL_INT(-18, state.temp_min);
}

/** @brief A missing temperature stays missing, or it would come out as a real looking -99. */
void test_a_missing_temperature_stays_missing_when_converted(void)
{
    WeatherState state = held();
    state.feels_like = WEATHER_NO_TEMP;

    weather_reading_convert(&state, true);

    TEST_ASSERT_EQUAL_INT(WEATHER_NO_TEMP, state.feels_like);
}

/** @brief The strip temperatures convert too, or the forecast row keeps the old unit beside the new. */
void test_the_strip_temperatures_convert_too(void)
{
    WeatherState state = held();
    state.hourly.count = 1;
    state.hourly.col[0].temp = 10;
    state.daily.count = 1;
    state.daily.col[0].temp_max = 20;
    state.daily.col[0].temp_min = -10;

    weather_reading_convert(&state, true);

    TEST_ASSERT_EQUAL_INT(50, state.hourly.col[0].temp);
    TEST_ASSERT_EQUAL_INT(68, state.daily.col[0].temp_max);
    TEST_ASSERT_EQUAL_INT(14, state.daily.col[0].temp_min);
}

/** @brief Readings that are not temperatures are left alone. */
void test_readings_that_are_not_temperatures_are_left_alone(void)
{
    WeatherState state = held();

    weather_reading_convert(&state, true);

    TEST_ASSERT_EQUAL_INT(1013, state.pressure);
    TEST_ASSERT_EQUAL_INT(40, state.humidity);
    TEST_ASSERT_EQUAL_INT(5, state.uv);
}

/** @brief A sunrise past the last minute of the day is no reading, since no clock can show it. */
void test_a_sunrise_no_clock_can_read_is_no_reading(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_EXTRA;
    msg.sunrise = 1440;
    msg.sunset = 20 * 60 + 14;

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(-1, state.sunrise);
    TEST_ASSERT_EQUAL_INT(20 * 60 + 14, state.sunset);
}

/**
 * @brief An hourly strip starting at the hour in progress is anchored to that hour's start.
 *
 * The anchor is what says later which columns are over, so it has to be the column's own start
 * rather than the time the strip landed.
 */
void test_an_hourly_strip_is_anchored_to_its_first_hour(void)
{
    WeatherState state = held();
    const uint8_t strip[] = {1, 14, 1, 3, 20, 0};
    WeatherMessage msg = empty_message();
    msg.hourly = strip;
    msg.hourly_len = sizeof(strip);

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(900 - 20 * 60 - 30, (int)state.hourly_first);
}

/** @brief An hourly strip starting at the next hour is anchored an hour on. */
void test_an_hourly_strip_starting_next_hour_is_anchored_an_hour_on(void)
{
    WeatherState state = held();
    const uint8_t strip[] = {1, 15, 1, 3, 20, 0};
    WeatherMessage msg = empty_message();
    msg.hourly = strip;
    msg.hourly_len = sizeof(strip);

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(900 - 20 * 60 - 30 + 3600, (int)state.hourly_first);
}

/**
 * @brief A daily strip that starts tomorrow is anchored to tomorrow's midnight.
 *
 * A late evening fetch can open the strip on the next day, and anchoring it to today would count
 * tomorrow as over as soon as it came.
 */
void test_a_daily_strip_starting_tomorrow_is_anchored_to_tomorrow(void)
{
    WeatherState state = held();
    const uint8_t strip[] = {1, 4, 3, 20, 0, 10, 0};
    WeatherMessage msg = empty_message();
    msg.daily = strip;
    msg.daily_len = sizeof(strip);

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(100000 + 86400, (int)state.daily_first);
}

/**
 * @brief An hourly strip that lands after its first hour is anchored in the past.
 *
 * A watch out of range gets the strip late. Anchored most of a day ahead, it never aged and kept
 * showing hours already gone.
 */
void test_an_hourly_strip_landing_late_is_anchored_behind(void)
{
    WeatherState state = held();
    const uint8_t strip[] = {1, 13, 1, 3, 20, 0};
    WeatherMessage msg = empty_message();
    msg.hourly = strip;
    msg.hourly_len = sizeof(strip);

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(900 - 20 * 60 - 30 - 3600, (int)state.hourly_first);
}

/** @brief A daily strip that starts yesterday is anchored to yesterday, so today's read trims it. */
void test_a_daily_strip_starting_yesterday_is_anchored_to_yesterday(void)
{
    WeatherState state = held();
    const uint8_t strip[] = {1, 2, 3, 20, 0, 10, 0};
    WeatherMessage msg = empty_message();
    msg.daily = strip;
    msg.daily_len = sizeof(strip);

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(100000 - 86400, (int)state.daily_first);
}

/** @brief A strip that does not read clean leaves its anchor alone, or the kept row would age from the wrong start. */
void test_a_bad_strip_leaves_its_anchor_alone(void)
{
    WeatherState state = held();
    state.hourly_first = 42;
    const uint8_t cut_short[] = {8, 14, 2, 1};
    WeatherMessage msg = empty_message();
    msg.hourly = cut_short;
    msg.hourly_len = sizeof(cut_short);

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(42, (int)state.hourly_first);
}

/** @brief The high, low, UV, and rain chance record the day they came, so they can be dropped once it is over. */
void test_the_forecast_group_records_its_day(void)
{
    WeatherState state = held();
    WeatherMessage msg = empty_message();
    msg.groups = WEATHER_GROUP_FORECAST;
    msg.temp_max = 30;

    weather_reading_apply(&state, &msg, &AFTERNOON);

    TEST_ASSERT_EQUAL_INT(100000, (int)state.forecast_day);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_a_failed_fetch_keeps_the_last_reading);
    RUN_TEST(test_a_good_reading_is_kept_and_stamped);
    RUN_TEST(test_a_temperature_out_of_range_is_clamped);
    RUN_TEST(test_a_group_blanks_the_readings_it_left_out);
    RUN_TEST(test_a_missing_extra_string_reads_empty);
    RUN_TEST(test_a_group_that_did_not_arrive_is_left_alone);
    RUN_TEST(test_a_negative_reading_is_kept);
    RUN_TEST(test_a_bad_strip_keeps_the_last_row);
    RUN_TEST(test_a_sunrise_no_clock_can_read_is_no_reading);
    RUN_TEST(test_an_hourly_strip_is_anchored_to_its_first_hour);
    RUN_TEST(test_an_hourly_strip_starting_next_hour_is_anchored_an_hour_on);
    RUN_TEST(test_a_daily_strip_starting_tomorrow_is_anchored_to_tomorrow);
    RUN_TEST(test_an_hourly_strip_landing_late_is_anchored_behind);
    RUN_TEST(test_a_daily_strip_starting_yesterday_is_anchored_to_yesterday);
    RUN_TEST(test_a_bad_strip_leaves_its_anchor_alone);
    RUN_TEST(test_the_forecast_group_records_its_day);
    RUN_TEST(test_a_celsius_reading_converts_to_fahrenheit);
    RUN_TEST(test_a_fahrenheit_reading_converts_back_to_celsius);
    RUN_TEST(test_a_below_zero_reading_rounds_to_the_nearest_degree);
    RUN_TEST(test_a_missing_temperature_stays_missing_when_converted);
    RUN_TEST(test_the_strip_temperatures_convert_too);
    RUN_TEST(test_readings_that_are_not_temperatures_are_left_alone);

    return UNITY_END();
}
