/**
 * @file appmessage_features.h
 * @brief Which of the phone's optional features a face has, worked out from the message keys it
 * declares. The waf build defines a HAS_MESSAGE_KEY_* for every key in the face's messageKeys, and
 * this turns those into one switch per feature, so every file asking the same question gets the
 * same answer.
 *
 * APPMESSAGE_HAS_SETTINGS is defined when the face declares both settings keys, so the phone can ask
 * for its settings and put them back after a wipe. APPMESSAGE_HAS_WEATHER is defined when the face
 * has weather, and APPMESSAGE_HAS_LOCATION when it gets coordinates.
 * APPMESSAGE_HAS_WEATHER_EXTRAS, APPMESSAGE_HAS_WEATHER_FORECAST, and
 * APPMESSAGE_HAS_WEATHER_AIR are defined for each weather group the face declares whole.
 * APPMESSAGE_HAS_PHONE is defined when it shows the phone's battery, and APPMESSAGE_HAS_MUSIC when it
 * shows what the phone is playing. APPMESSAGE_HAS_MUSIC_ART is defined when it shows album art too.
 *
 * A face that declares part of a set stops the build here, with each missing key named. The manifest
 * build refuses the same sets before it writes any sandbox, naming the face, so these are what still
 * stops a build run some other way.
 *
 * A face that keeps a plugin source choice without both settings keys stops the build here too. The
 * manifest build adds both for it, so this is what still stops a build run some other way.
 *
 * @ingroup lib_io
 */
#pragma once

// a face has the settings reply when it declares both settings keys. the phone asks for the
// watch's settings with SETTINGS_REQUEST, and the watch answers with SETTINGS_FRESH to say it booted
// with nothing saved, so the phone puts the wearer's settings back rather than copying the watch's
// defaults over them. a face that declares neither never has its settings sent back or restored.
// one without the other stops the build with the missing one named
#if defined(HAS_MESSAGE_KEY_SETTINGS_REQUEST) && defined(HAS_MESSAGE_KEY_SETTINGS_FRESH)
#define APPMESSAGE_HAS_SETTINGS 1 ///< the face declares both settings keys
#elif defined(HAS_MESSAGE_KEY_SETTINGS_REQUEST)
#error "settings need SETTINGS_FRESH in messageKeys beside SETTINGS_REQUEST"
#elif defined(HAS_MESSAGE_KEY_SETTINGS_FRESH)
#error "settings need SETTINGS_REQUEST in messageKeys beside SETTINGS_FRESH"
#endif

// a face has weather when it declares all four of these. the watch asks with the first and reads a
// reading off the other three, so all four are one decision. the ok flag is the one that tells a
// failed fetch from a reading, and a face without it would show "NO GPS" as a live 0 degrees.
// a face that declares none opted out of weather and builds without it. a face that declares only
// some has a typo or a gap, which would otherwise build and go wrong on the watch, so the build
// stops and names each missing key
#if defined(HAS_MESSAGE_KEY_WEATHER_REQUEST) && defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE) && \
    defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS) && defined(HAS_MESSAGE_KEY_WEATHER_OK)
#define APPMESSAGE_HAS_WEATHER 1 ///< the face declares all four weather keys
#elif defined(HAS_MESSAGE_KEY_WEATHER_REQUEST) || defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE) || \
    defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS) || defined(HAS_MESSAGE_KEY_WEATHER_OK)
#if !defined(HAS_MESSAGE_KEY_WEATHER_REQUEST)
#error "weather needs WEATHER_REQUEST in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE)
#error "weather needs WEATHER_TEMPERATURE in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS)
#error "weather needs WEATHER_CONDITIONS in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_OK)
#error "weather needs WEATHER_OK in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#endif

// the weather extras, today's forecast, and the air readings are each read whole, so a face that
// declares only part of one would get none of it and leave those panels on dashes with nothing to
// say why. the build stops instead and names each missing key
#if defined(HAS_MESSAGE_KEY_WEATHER_HUMIDITY) && defined(HAS_MESSAGE_KEY_WEATHER_WIND_SPEED) && \
    defined(HAS_MESSAGE_KEY_WEATHER_WIND_DIR) && defined(HAS_MESSAGE_KEY_WEATHER_SUNRISE) && \
    defined(HAS_MESSAGE_KEY_WEATHER_SUNSET)
#define APPMESSAGE_HAS_WEATHER_EXTRAS 1 ///< the face declares all five weather extras keys
#elif defined(HAS_MESSAGE_KEY_WEATHER_HUMIDITY) || defined(HAS_MESSAGE_KEY_WEATHER_WIND_SPEED) || \
    defined(HAS_MESSAGE_KEY_WEATHER_WIND_DIR) || defined(HAS_MESSAGE_KEY_WEATHER_SUNRISE) || \
    defined(HAS_MESSAGE_KEY_WEATHER_SUNSET)
#if !defined(HAS_MESSAGE_KEY_WEATHER_HUMIDITY)
#error "the weather extras need WEATHER_HUMIDITY in messageKeys. A face with the extras declares WEATHER_HUMIDITY, WEATHER_WIND_SPEED, WEATHER_WIND_DIR, WEATHER_SUNRISE, and WEATHER_SUNSET"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_WIND_SPEED)
#error "the weather extras need WEATHER_WIND_SPEED in messageKeys. A face with the extras declares WEATHER_HUMIDITY, WEATHER_WIND_SPEED, WEATHER_WIND_DIR, WEATHER_SUNRISE, and WEATHER_SUNSET"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_WIND_DIR)
#error "the weather extras need WEATHER_WIND_DIR in messageKeys. A face with the extras declares WEATHER_HUMIDITY, WEATHER_WIND_SPEED, WEATHER_WIND_DIR, WEATHER_SUNRISE, and WEATHER_SUNSET"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_SUNRISE)
#error "the weather extras need WEATHER_SUNRISE in messageKeys. A face with the extras declares WEATHER_HUMIDITY, WEATHER_WIND_SPEED, WEATHER_WIND_DIR, WEATHER_SUNRISE, and WEATHER_SUNSET"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_SUNSET)
#error "the weather extras need WEATHER_SUNSET in messageKeys. A face with the extras declares WEATHER_HUMIDITY, WEATHER_WIND_SPEED, WEATHER_WIND_DIR, WEATHER_SUNRISE, and WEATHER_SUNSET"
#endif
#endif

#if defined(HAS_MESSAGE_KEY_WEATHER_UV_INDEX) && defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MAX) && \
    defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MIN) && defined(HAS_MESSAGE_KEY_WEATHER_PRECIP_CHANCE)
#define APPMESSAGE_HAS_WEATHER_FORECAST 1 ///< the face declares all four of today's forecast keys
#elif defined(HAS_MESSAGE_KEY_WEATHER_UV_INDEX) || defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MAX) || \
    defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MIN) || defined(HAS_MESSAGE_KEY_WEATHER_PRECIP_CHANCE)
#if !defined(HAS_MESSAGE_KEY_WEATHER_UV_INDEX)
#error "today's forecast needs WEATHER_UV_INDEX in messageKeys. A face with today's forecast declares WEATHER_UV_INDEX, WEATHER_TEMP_MAX, WEATHER_TEMP_MIN, and WEATHER_PRECIP_CHANCE"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MAX)
#error "today's forecast needs WEATHER_TEMP_MAX in messageKeys. A face with today's forecast declares WEATHER_UV_INDEX, WEATHER_TEMP_MAX, WEATHER_TEMP_MIN, and WEATHER_PRECIP_CHANCE"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MIN)
#error "today's forecast needs WEATHER_TEMP_MIN in messageKeys. A face with today's forecast declares WEATHER_UV_INDEX, WEATHER_TEMP_MAX, WEATHER_TEMP_MIN, and WEATHER_PRECIP_CHANCE"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_PRECIP_CHANCE)
#error "today's forecast needs WEATHER_PRECIP_CHANCE in messageKeys. A face with today's forecast declares WEATHER_UV_INDEX, WEATHER_TEMP_MAX, WEATHER_TEMP_MIN, and WEATHER_PRECIP_CHANCE"
#endif
#endif

#if defined(HAS_MESSAGE_KEY_WEATHER_FEELS_LIKE) && defined(HAS_MESSAGE_KEY_WEATHER_PRESSURE) && \
    defined(HAS_MESSAGE_KEY_WEATHER_DEW_POINT)
#define APPMESSAGE_HAS_WEATHER_AIR 1 ///< the face declares all three air reading keys
#elif defined(HAS_MESSAGE_KEY_WEATHER_FEELS_LIKE) || defined(HAS_MESSAGE_KEY_WEATHER_PRESSURE) || \
    defined(HAS_MESSAGE_KEY_WEATHER_DEW_POINT)
#if !defined(HAS_MESSAGE_KEY_WEATHER_FEELS_LIKE)
#error "the air readings need WEATHER_FEELS_LIKE in messageKeys. A face with the air readings declares WEATHER_FEELS_LIKE, WEATHER_PRESSURE, and WEATHER_DEW_POINT"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_PRESSURE)
#error "the air readings need WEATHER_PRESSURE in messageKeys. A face with the air readings declares WEATHER_FEELS_LIKE, WEATHER_PRESSURE, and WEATHER_DEW_POINT"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_DEW_POINT)
#error "the air readings need WEATHER_DEW_POINT in messageKeys. A face with the air readings declares WEATHER_FEELS_LIKE, WEATHER_PRESSURE, and WEATHER_DEW_POINT"
#endif
#endif

// a weather group is only read beside a reading, so one declared without the four weather keys
// would build and never arrive. the build stops instead. a face with some of the four already has
// an error above for each one it is missing, so this only fires for a face with none of them
#if !defined(HAS_MESSAGE_KEY_WEATHER_REQUEST) && !defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE) && \
    !defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS) && !defined(HAS_MESSAGE_KEY_WEATHER_OK) && \
    (defined(APPMESSAGE_HAS_WEATHER_EXTRAS) || \
    defined(APPMESSAGE_HAS_WEATHER_FORECAST) || defined(APPMESSAGE_HAS_WEATHER_AIR) || \
    defined(HAS_MESSAGE_KEY_WEATHER_CONDITION_LABEL) || defined(HAS_MESSAGE_KEY_WEATHER_FORECAST_HOURLY) || \
    defined(HAS_MESSAGE_KEY_WEATHER_FORECAST_DAILY))
#error "the weather groups need weather in messageKeys. Declare WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK beside them"
#endif

// a face gets coordinates when it declares both halves of the pair. they arrive together, so one
// without the other could never make a fix, and the build stops and names the missing half rather
// than leave the face without coordinates and nothing to say why
#if defined(HAS_MESSAGE_KEY_LOCATION_LATITUDE) && defined(HAS_MESSAGE_KEY_LOCATION_LONGITUDE)
#define APPMESSAGE_HAS_LOCATION 1 ///< the face declares both coordinate keys
#elif defined(HAS_MESSAGE_KEY_LOCATION_LATITUDE)
#error "coordinates need LOCATION_LONGITUDE in messageKeys beside LOCATION_LATITUDE"
#elif defined(HAS_MESSAGE_KEY_LOCATION_LONGITUDE)
#error "coordinates need LOCATION_LATITUDE in messageKeys beside LOCATION_LONGITUDE"
#endif

// a face shows the phone's battery when it declares both phone keys. the watch asks with one and
// reads the level off the other, so one without the other could never show a level, and the build
// stops and names the missing one
#if defined(HAS_MESSAGE_KEY_PHONE_BATTERY) && defined(HAS_MESSAGE_KEY_PHONE_REQUEST)
#define APPMESSAGE_HAS_PHONE 1 ///< the face declares both phone battery keys
#elif defined(HAS_MESSAGE_KEY_PHONE_BATTERY)
#error "the phone battery needs PHONE_REQUEST in messageKeys beside PHONE_BATTERY"
#elif defined(HAS_MESSAGE_KEY_PHONE_REQUEST)
#error "the phone battery needs PHONE_BATTERY in messageKeys beside PHONE_REQUEST"
#endif

// a face shows what the phone is playing when it declares all four music keys. the phone sends the
// three values in one message and the watch asks with the fourth, so they are one decision, and a
// face that declares only some of them stops the build with each missing one named
#if defined(HAS_MESSAGE_KEY_MUSIC_TITLE) && defined(HAS_MESSAGE_KEY_MUSIC_ARTIST) && \
    defined(HAS_MESSAGE_KEY_MUSIC_PLAYING) && defined(HAS_MESSAGE_KEY_MUSIC_REQUEST)
#define APPMESSAGE_HAS_MUSIC 1 ///< the face declares all four now playing keys
#elif defined(HAS_MESSAGE_KEY_MUSIC_TITLE) || defined(HAS_MESSAGE_KEY_MUSIC_ARTIST) || \
    defined(HAS_MESSAGE_KEY_MUSIC_PLAYING) || defined(HAS_MESSAGE_KEY_MUSIC_REQUEST)
#if !defined(HAS_MESSAGE_KEY_MUSIC_TITLE)
#error "now playing needs MUSIC_TITLE in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#if !defined(HAS_MESSAGE_KEY_MUSIC_ARTIST)
#error "now playing needs MUSIC_ARTIST in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#if !defined(HAS_MESSAGE_KEY_MUSIC_PLAYING)
#error "now playing needs MUSIC_PLAYING in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#if !defined(HAS_MESSAGE_KEY_MUSIC_REQUEST)
#error "now playing needs MUSIC_REQUEST in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#endif

// album art rides its own key beside the four now playing keys, for a face that started the phone's
// music feature with art. art with no track to go beside would never be asked for
#if defined(APPMESSAGE_HAS_MUSIC) && defined(HAS_MESSAGE_KEY_MUSIC_ARTWORK)
#define APPMESSAGE_HAS_MUSIC_ART 1 ///< the face declares the album art key beside the now playing keys
#elif defined(HAS_MESSAGE_KEY_MUSIC_ARTWORK)
#error "album art needs MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST in messageKeys beside MUSIC_ARTWORK"
#endif

// a face that keeps a plugin source choice needs the settings reply, since only that hands the
// wearer's pick back to the phone. without it a reinstall of the Pebble app loses the pick
#include "system/settings/plugin_source.h"
#if PLUGIN_SOURCE_KEEPS_ANY && !defined(APPMESSAGE_HAS_SETTINGS)
#error "a kept plugin source choice needs SETTINGS_REQUEST and SETTINGS_FRESH in messageKeys, since only the settings reply hands it back to the phone"
#endif
