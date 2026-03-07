#include "sensor.h"
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/adc.h>
#include <hal/nrf_saadc.h>

#define ADC_NODE DT_NODELABEL(adc)
#define HALL_CLICK_THRESHOLD 2600
#define HALL_RELEASE_THRESHOLD 2400

static const struct device *adc_dev;
static int16_t sample_buffer[2];
static bool hall1_click_latched;
static bool hall2_click_latched;

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

static bool sensor_should_trigger_channel_click(int32_t hall_value, bool *latched)
{
    bool hall_active = hall_value >= HALL_CLICK_THRESHOLD;
    bool hall_released = hall_value < HALL_RELEASE_THRESHOLD;

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
