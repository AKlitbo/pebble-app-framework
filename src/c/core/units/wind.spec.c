/**
 * @file wind.spec.c
 * @brief Host tests for the wind-speed conversions and labels.
 *
 * Each unit has its own integer factor and the maths rounds to the nearest whole number, so the
 * factors, the rounding, and the km/h fallback are what these tests pin down. A plugin's wind reaches
 * the watch as whole km/h, and truncating it back showed a plugin's 10 mph as 9.
 */
#include "unity.h"

#include "units/wind.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief 100 km/h is about 62 mph, so a wrong factor would show the wrong gust. */
void test_wind_converts_kmh_to_mph(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_MPH);

    TEST_ASSERT_EQUAL_INT(62, result);
}

/** @brief 100 km/h is about 54 knots, the sailor's reading. */
void test_wind_converts_kmh_to_knots(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_KTS);

    TEST_ASSERT_EQUAL_INT(54, result);
}

/** @brief 100 km/h is 27.8 m/s, which rounds to 28. */
void test_wind_converts_kmh_to_metres_per_second(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_MS);

    TEST_ASSERT_EQUAL_INT(28, result);
}

/** @brief km/h is the source unit so it must pass straight through untouched. */
void test_wind_passes_kmh_straight_through(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_KMH);

    TEST_ASSERT_EQUAL_INT(100, result);
}

/** @brief A plugin's 10 mph reaches the watch as 16 km/h, and has to show as 10 mph again, not 9. */
void test_wind_rounds_a_plugin_mph_back_to_itself(void)
{
    int result = wind_from_kmh(16, WIND_UNIT_MPH);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/** @brief 35 km/h is 18.9 knots, which shows as 19 rather than the 18 a floor gives. */
void test_wind_rounds_knots_to_the_nearest(void)
{
    int result = wind_from_kmh(35, WIND_UNIT_KTS);

    TEST_ASSERT_EQUAL_INT(19, result);
}

/** @brief 10 km/h is 6.2 mph, so rounding still lands below a half on 6. */
void test_wind_rounds_down_below_a_half(void)
{
    int result = wind_from_kmh(10, WIND_UNIT_MPH);

    TEST_ASSERT_EQUAL_INT(6, result);
}

/** @brief Each unit must carry its own short label or the number sits next to the wrong tag. */
void test_wind_labels_each_unit(void)
{
    const char *kmh = wind_unit_label(WIND_UNIT_KMH);
    const char *mph = wind_unit_label(WIND_UNIT_MPH);
    const char *kts = wind_unit_label(WIND_UNIT_KTS);
    const char *ms = wind_unit_label(WIND_UNIT_MS);

    TEST_ASSERT_EQUAL_STRING("KM/H", kmh);
    TEST_ASSERT_EQUAL_STRING("MPH", mph);
    TEST_ASSERT_EQUAL_STRING("KTS", kts);
    TEST_ASSERT_EQUAL_STRING("M/S", ms);
}

/**
 * @brief A unit value past the known ones still reads as km/h, number and label together.
 *
 * The unit arrives as a raw settings byte. A value the watch does not know leaves the speed in
 * km/h, so the label has to say km/h too, or the panel shows a km/h number tagged as something
 * else.
 */
void test_wind_falls_back_to_kmh_for_an_unknown_unit(void)
{
    int speed = wind_from_kmh(100, WIND_UNIT_COUNT);
    const char *label = wind_unit_label(WIND_UNIT_COUNT);

    TEST_ASSERT_EQUAL_INT(100, speed);
    TEST_ASSERT_EQUAL_STRING("KM/H", label);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_wind_converts_kmh_to_mph);
    RUN_TEST(test_wind_converts_kmh_to_knots);
    RUN_TEST(test_wind_converts_kmh_to_metres_per_second);
    RUN_TEST(test_wind_passes_kmh_straight_through);
    RUN_TEST(test_wind_rounds_a_plugin_mph_back_to_itself);
    RUN_TEST(test_wind_rounds_knots_to_the_nearest);
    RUN_TEST(test_wind_rounds_down_below_a_half);
    RUN_TEST(test_wind_labels_each_unit);
    RUN_TEST(test_wind_falls_back_to_kmh_for_an_unknown_unit);

    return UNITY_END();
}
