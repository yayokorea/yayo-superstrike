#include "sensor.h"
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/drivers/flash.h>
#include <zephyr/fs/nvs.h>
#include <zephyr/storage/flash_map.h>
#include <hal/nrf_saadc.h>
#include <string.h>

#define ADC_NODE DT_NODELABEL(adc)
#define HALL1_DEFAULT_CLICK_THRESHOLD 2600
#define HALL1_DEFAULT_RELEASE_THRESHOLD 2400
#define HALL2_DEFAULT_CLICK_THRESHOLD 2600
#define HALL2_DEFAULT_RELEASE_THRESHOLD 2400
#define CALIBRATION_SAMPLE_TARGET 8
#define SENSOR_CALIBRATION_MAGIC 0x43414c31U
#define SENSOR_CALIBRATION_NVS_ID 1U
#define BATTERY_ADC_CHANNEL_ID 7
#define BATTERY_DIVIDER_OUTPUT_OHMS 1U
#define BATTERY_DIVIDER_FULL_OHMS 5U
#define BATTERY_SAMPLE_COUNT 5U
#define BATTERY_EMA_SHIFT 3U

static const struct device *adc_dev;
static int16_t sample_buffer[2];
static int16_t battery_sample_buffer;
static bool battery_adc_needs_calibration = true;
static uint16_t battery_filtered_millivolts;
static bool hall1_click_latched;
static bool hall2_click_latched;
static int32_t hall1_click_threshold = HALL1_DEFAULT_CLICK_THRESHOLD;
static int32_t hall1_release_threshold = HALL1_DEFAULT_RELEASE_THRESHOLD;
static int32_t hall2_click_threshold = HALL2_DEFAULT_CLICK_THRESHOLD;
static int32_t hall2_release_threshold = HALL2_DEFAULT_RELEASE_THRESHOLD;
static int32_t hall1_idle_value;
static int32_t hall1_press_value;
static int32_t hall2_idle_value;
static int32_t hall2_press_value;
static bool hall1_idle_captured;
static bool hall1_press_captured;
static bool hall2_idle_captured;
static bool hall2_press_captured;
static bool hall1_calibrated;
static bool hall2_calibrated;
static uint8_t calibration_command;
static uint8_t calibration_sample_count;
static int64_t calibration_sample_sum;
static struct nvs_fs calibration_nvs;
static bool calibration_storage_ready;

struct sensor_calibration_flash_data {
    uint32_t magic;
    int32_t hall1_idle;
    int32_t hall1_press;
    int32_t hall1_threshold;
    int32_t hall1_release;
    int32_t hall2_idle;
    int32_t hall2_press;
    int32_t hall2_threshold;
    int32_t hall2_release;
    uint8_t hall1_ready;
    uint8_t hall2_ready;
    uint8_t reserved[2];
};

static const struct adc_channel_cfg vdt_cfg1 = {
    .gain             = ADC_GAIN_1_6, 
    .reference        = ADC_REF_INTERNAL, // 0.6V
    .acquisition_time = ADC_ACQ_TIME_DEFAULT,
    .channel_id       = 0, // AIN0 (P0.02)
    .input_positive   = NRF_SAADC_INPUT_AIN0
};

static const struct adc_channel_cfg vdt_cfg2 = {
    .gain             = ADC_GAIN_1_6,
    .reference        = ADC_REF_INTERNAL, // 0.6V
    .acquisition_time = ADC_ACQ_TIME_DEFAULT,
    .channel_id       = 5, // AIN5 (P0.29)
    .input_positive   = NRF_SAADC_INPUT_AIN5
};

static const struct adc_channel_cfg battery_cfg = {
    .gain             = ADC_GAIN_1_6,
    .reference        = ADC_REF_INTERNAL,
    .acquisition_time = ADC_ACQ_TIME(ADC_ACQ_TIME_MICROSECONDS, 10),
    .channel_id       = BATTERY_ADC_CHANNEL_ID,
    .input_positive   = NRF_SAADC_INPUT_VDDHDIV5
};

struct battery_level_point {
    uint16_t percent;
    uint16_t millivolts;
};

static const struct battery_level_point battery_levels[] = {
    { 100U, 4150U },
    { 95U, 4025U },
    { 30U, 3650U },
    { 5U, 3400U },
    { 0U, 3200U },
};

static uint16_t sensor_battery_raw_to_mv(int16_t raw)
{
    int32_t millivolts = raw;

    if (raw <= 0) {
        return 0U;
    }

    if (adc_raw_to_millivolts(adc_ref_internal(adc_dev),
                              battery_cfg.gain,
                              14,
                              &millivolts) != 0) {
        return 0U;
    }

    if (millivolts <= 0) {
        return 0U;
    }

    return (uint16_t)(((uint32_t)millivolts * BATTERY_DIVIDER_FULL_OHMS) /
                      BATTERY_DIVIDER_OUTPUT_OHMS);
}

static uint8_t sensor_battery_mv_to_percent(uint16_t millivolts)
{
    const struct battery_level_point *below;
    const struct battery_level_point *above;

    if (millivolts >= battery_levels[0].millivolts) {
        return battery_levels[0].percent;
    }

    below = &battery_levels[ARRAY_SIZE(battery_levels) - 1];
    if (millivolts <= below->millivolts) {
        return below->percent;
    }

    for (size_t i = 1; i < ARRAY_SIZE(battery_levels); ++i) {
        if (millivolts >= battery_levels[i].millivolts) {
            above = &battery_levels[i - 1];
            below = &battery_levels[i];

            return (uint8_t)(below->percent +
                             ((above->percent - below->percent) *
                              (millivolts - below->millivolts)) /
                             (above->millivolts - below->millivolts));
        }
    }

    return 0U;
}

static uint16_t sensor_read_battery_once_mv(void)
{
    struct adc_sequence sequence = {
        .channels = BIT(BATTERY_ADC_CHANNEL_ID),
        .buffer = &battery_sample_buffer,
        .buffer_size = sizeof(battery_sample_buffer),
        .oversampling = 2,
        .resolution = 14,
        .calibrate = battery_adc_needs_calibration,
    };

    if (adc_read(adc_dev, &sequence) != 0) {
        return 0U;
    }

    battery_adc_needs_calibration = false;
    return sensor_battery_raw_to_mv(battery_sample_buffer);
}

static uint16_t sensor_filter_battery_mv(void)
{
    uint16_t samples[BATTERY_SAMPLE_COUNT];
    uint16_t sample_mv;

    for (size_t i = 0; i < ARRAY_SIZE(samples); ++i) {
        sample_mv = sensor_read_battery_once_mv();
        if (sample_mv == 0U) {
            return 0U;
        }

        samples[i] = sample_mv;
    }

    for (size_t i = 1; i < ARRAY_SIZE(samples); ++i) {
        uint16_t key = samples[i];
        size_t j = i;

        while ((j > 0U) && (samples[j - 1U] > key)) {
            samples[j] = samples[j - 1U];
            --j;
        }

        samples[j] = key;
    }

    sample_mv = samples[ARRAY_SIZE(samples) / 2U];

    if (battery_filtered_millivolts == 0U) {
        battery_filtered_millivolts = sample_mv;
    } else {
        battery_filtered_millivolts =
            (uint16_t)(((uint32_t)battery_filtered_millivolts *
                        ((1U << BATTERY_EMA_SHIFT) - 1U) +
                        sample_mv) >>
                       BATTERY_EMA_SHIFT);
    }

    return battery_filtered_millivolts;
}

static void sensor_save_calibration(void)
{
    struct sensor_calibration_flash_data data = {
        .magic = SENSOR_CALIBRATION_MAGIC,
        .hall1_idle = hall1_idle_value,
        .hall1_press = hall1_press_value,
        .hall1_threshold = hall1_click_threshold,
        .hall1_release = hall1_release_threshold,
        .hall2_idle = hall2_idle_value,
        .hall2_press = hall2_press_value,
        .hall2_threshold = hall2_click_threshold,
        .hall2_release = hall2_release_threshold,
        .hall1_ready = hall1_calibrated ? 1U : 0U,
        .hall2_ready = hall2_calibrated ? 1U : 0U,
    };

    if (!calibration_storage_ready) {
        return;
    }

    if (nvs_write(&calibration_nvs, SENSOR_CALIBRATION_NVS_ID,
                  &data, sizeof(data)) < 0) {
        printk("Failed to save calibration\n");
    }
}

static void sensor_load_calibration(void)
{
    struct sensor_calibration_flash_data data;
    ssize_t len;

    if (!calibration_storage_ready) {
        return;
    }

    len = nvs_read(&calibration_nvs, SENSOR_CALIBRATION_NVS_ID, &data, sizeof(data));
    if ((len != sizeof(data)) || (data.magic != SENSOR_CALIBRATION_MAGIC)) {
        return;
    }

    hall1_idle_value = data.hall1_idle;
    hall1_press_value = data.hall1_press;
    hall1_click_threshold = data.hall1_threshold;
    hall1_release_threshold = data.hall1_release;
    hall2_idle_value = data.hall2_idle;
    hall2_press_value = data.hall2_press;
    hall2_click_threshold = data.hall2_threshold;
    hall2_release_threshold = data.hall2_release;
    hall1_calibrated = data.hall1_ready == 1U;
    hall2_calibrated = data.hall2_ready == 1U;
    hall1_idle_captured = hall1_calibrated;
    hall1_press_captured = hall1_calibrated;
    hall2_idle_captured = hall2_calibrated;
    hall2_press_captured = hall2_calibrated;
}

static void sensor_storage_init(void)
{
    const struct flash_area *storage_area;
    struct flash_pages_info info;

    if (flash_area_open(FIXED_PARTITION_ID(storage_partition), &storage_area) != 0) {
        printk("Failed to open storage partition\n");
        return;
    }

    calibration_nvs.flash_device = storage_area->fa_dev;
    calibration_nvs.offset = storage_area->fa_off;

    if (flash_get_page_info_by_offs(storage_area->fa_dev, storage_area->fa_off, &info) != 0) {
        printk("Failed to get storage page info\n");
        flash_area_close(storage_area);
        return;
    }

    calibration_nvs.sector_size = info.size;
    calibration_nvs.sector_count = storage_area->fa_size / info.size;

    if (nvs_mount(&calibration_nvs) != 0) {
        printk("Failed to mount NVS\n");
        flash_area_close(storage_area);
        return;
    }

    calibration_storage_ready = true;
    sensor_load_calibration();
    flash_area_close(storage_area);
}

void sensor_init(void)
{
    adc_dev = DEVICE_DT_GET(ADC_NODE);
    if (!device_is_ready(adc_dev)) {
        return;
    }

    adc_channel_setup(adc_dev, &vdt_cfg1);
    adc_channel_setup(adc_dev, &vdt_cfg2);
    adc_channel_setup(adc_dev, &battery_cfg);
    sensor_storage_init();
}

void sensor_read_hall(int32_t *hall1, int32_t *hall2)
{
    if (!adc_dev) {
        *hall1 = 0;
        *hall2 = 0;
        return;
    }

    struct adc_sequence sequence = {
        .channels    = BIT(0) | BIT(5),
        .buffer      = sample_buffer,
        .buffer_size = sizeof(sample_buffer),
        .resolution  = 12,
    };

    int err = adc_read(adc_dev, &sequence);
    if (err == 0) {
        *hall1 = sample_buffer[0];
        *hall2 = sample_buffer[1];
    } else {
        *hall1 = -1;
        *hall2 = -1;
    }
}

void sensor_read_battery(struct sensor_battery_status *status)
{
    if (!status) {
        return;
    }

    status->millivolts = 0U;
    status->percent = 0U;

    if (!adc_dev) {
        return;
    }

    status->millivolts = sensor_filter_battery_mv();
    status->percent = sensor_battery_mv_to_percent(status->millivolts);
}

static void sensor_apply_calibration(int32_t idle, int32_t press,
                                     int32_t *click_threshold,
                                     int32_t *release_threshold)
{
    int32_t delta = press - idle;

    *click_threshold = idle + ((delta * 7) / 10);
    *release_threshold = idle + (delta / 2);
}

void sensor_calibration_update(int32_t hall1, int32_t hall2)
{
    int32_t hall_value;

    if (calibration_command == 0) {
        return;
    }

    switch (calibration_command) {
    case SENSOR_CALIB_CMD_HALL1_IDLE:
    case SENSOR_CALIB_CMD_HALL1_PRESS:
        hall_value = hall1;
        break;
    case SENSOR_CALIB_CMD_HALL2_IDLE:
    case SENSOR_CALIB_CMD_HALL2_PRESS:
        hall_value = hall2;
        break;
    default:
        calibration_command = 0;
        calibration_sample_count = 0;
        calibration_sample_sum = 0;
        return;
    }

    calibration_sample_sum += hall_value;
    calibration_sample_count++;

    if (calibration_sample_count < CALIBRATION_SAMPLE_TARGET) {
        return;
    }

    int32_t average = (int32_t)(calibration_sample_sum / CALIBRATION_SAMPLE_TARGET);

    switch (calibration_command) {
    case SENSOR_CALIB_CMD_HALL1_IDLE:
        hall1_idle_value = average;
        hall1_idle_captured = true;
        if (hall1_idle_captured && hall1_press_captured &&
            (hall1_press_value > hall1_idle_value)) {
            sensor_apply_calibration(hall1_idle_value, hall1_press_value,
                                     &hall1_click_threshold, &hall1_release_threshold);
            hall1_calibrated = true;
            sensor_save_calibration();
        }
        break;
    case SENSOR_CALIB_CMD_HALL1_PRESS:
        hall1_press_value = average;
        hall1_press_captured = true;
        if (hall1_idle_captured && hall1_press_captured &&
            (hall1_press_value > hall1_idle_value)) {
            sensor_apply_calibration(hall1_idle_value, hall1_press_value,
                                     &hall1_click_threshold, &hall1_release_threshold);
            hall1_calibrated = true;
            sensor_save_calibration();
        }
        break;
    case SENSOR_CALIB_CMD_HALL2_IDLE:
        hall2_idle_value = average;
        hall2_idle_captured = true;
        if (hall2_idle_captured && hall2_press_captured &&
            (hall2_press_value > hall2_idle_value)) {
            sensor_apply_calibration(hall2_idle_value, hall2_press_value,
                                     &hall2_click_threshold, &hall2_release_threshold);
            hall2_calibrated = true;
            sensor_save_calibration();
        }
        break;
    case SENSOR_CALIB_CMD_HALL2_PRESS:
        hall2_press_value = average;
        hall2_press_captured = true;
        if (hall2_idle_captured && hall2_press_captured &&
            (hall2_press_value > hall2_idle_value)) {
            sensor_apply_calibration(hall2_idle_value, hall2_press_value,
                                     &hall2_click_threshold, &hall2_release_threshold);
            hall2_calibrated = true;
            sensor_save_calibration();
        }
        break;
    default:
        break;
    }

    calibration_command = 0;
    calibration_sample_count = 0;
    calibration_sample_sum = 0;
}

int sensor_start_calibration(uint8_t command)
{
    switch (command) {
    case SENSOR_CALIB_CMD_HALL1_IDLE:
    case SENSOR_CALIB_CMD_HALL1_PRESS:
    case SENSOR_CALIB_CMD_HALL2_IDLE:
    case SENSOR_CALIB_CMD_HALL2_PRESS:
        calibration_command = command;
        calibration_sample_count = 0;
        calibration_sample_sum = 0;
        return 0;
    default:
        return -1;
    }
}

void sensor_get_calibration_status(struct sensor_calibration_status *status)
{
    if (!status) {
        return;
    }

    memset(status, 0, sizeof(*status));
    status->hall1_idle = hall1_idle_value;
    status->hall1_press = hall1_press_value;
    status->hall1_threshold = hall1_click_threshold;
    status->hall1_release = hall1_release_threshold;
    status->hall2_idle = hall2_idle_value;
    status->hall2_press = hall2_press_value;
    status->hall2_threshold = hall2_click_threshold;
    status->hall2_release = hall2_release_threshold;
    status->active_command = calibration_command;
    status->sample_count = calibration_sample_count;
    status->hall1_ready = hall1_calibrated ? 1U : 0U;
    status->hall2_ready = hall2_calibrated ? 1U : 0U;
}

static bool sensor_should_trigger_channel_click(int32_t hall_value, bool *latched)
{
    int32_t click_threshold;
    int32_t release_threshold;

    if (latched == &hall1_click_latched) {
        click_threshold = hall1_click_threshold;
        release_threshold = hall1_release_threshold;
    } else {
        click_threshold = hall2_click_threshold;
        release_threshold = hall2_release_threshold;
    }

    bool hall_active = hall_value >= click_threshold;
    bool hall_released = hall_value < release_threshold;

    if (!(*latched) && hall_active) {
        *latched = true;
        return true;
    }

    if (*latched && hall_released) {
        *latched = false;
    }

    return false;
}

bool sensor_should_trigger_left_click(int32_t hall1)
{
    return sensor_should_trigger_channel_click(hall1, &hall1_click_latched);
}

bool sensor_should_trigger_right_click(int32_t hall2)
{
    return sensor_should_trigger_channel_click(hall2, &hall2_click_latched);
}
