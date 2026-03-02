#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/sys/printk.h>
#include <stdlib.h>
#include <stdint.h>

#include "temperature.h"
#include "ble.h"

static const struct device *temp_sensor = DEVICE_DT_GET_ANY(nordic_nrf_temp);

int temperature_init(void)
{
	if (!device_is_ready(temp_sensor)) {
		return -1;
	}
	return 0;
}

int temperature_read(void)
{
	int ret;
	struct sensor_value temp;

	ret = sensor_sample_fetch(temp_sensor);
	if (ret < 0) {
		return ret;
	}

	ret = sensor_channel_get(temp_sensor, SENSOR_CHAN_DIE_TEMP, &temp);
	if (ret < 0) {
		return ret;
	}

	printk("Temperature: %d.%06d C\n", temp.val1, abs(temp.val2));

	int32_t temp_encoded = (temp.val1 * 100) + (temp.val2 / 10000);
	ble_notify_temperature(temp_encoded);

	return 0;
}
