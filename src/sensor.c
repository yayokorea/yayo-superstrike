#include "sensor.h"
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/adc.h>
#include <hal/nrf_saadc.h>
#include <string.h>

#define ADC_NODE DT_NODELABEL(adc)
#define HALL1_DEFAULT_CLICK_THRESHOLD 2600
#define HALL1_DEFAULT_RELEASE_THRESHOLD 2400
#define HALL2_DEFAULT_CLICK_THRESHOLD 2600
#define HALL2_DEFAULT_RELEASE_THRESHOLD 2400
#define CALIBRATION_SAMPLE_TARGET 8

static const struct device *adc_dev;
static int16_t sample_buffer[2];
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

void sensor_init(void)
{
    adc_dev = DEVICE_DT_GET(ADC_NODE);
    if (!device_is_ready(adc_dev)) {
        return;
    }

    adc_channel_setup(adc_dev, &vdt_cfg1);
    adc_channel_setup(adc_dev, &vdt_cfg2);
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
