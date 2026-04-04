#include <zephyr/kernel.h>
#include <zephyr/dfu/mcuboot.h>
#include <zephyr/sys/printk.h>

#include "usb_console.h"
#include "led.h"
#include "ble.h"
#include "temperature.h"
#include "motor.h"
#include "sensor.h"

static void confirm_running_image(void)
{
	if (boot_is_img_confirmed()) {
		return;
	}

	int err = boot_write_img_confirmed();

	if (err) {
		printk("Failed to confirm MCUboot image (err %d)\n", err);
	} else {
		printk("MCUboot image confirmed\n");
	}
}

int main(void)
{
	usb_console_init();
	confirm_running_image();

	printk("\n=== Zephyr BLE Peripheral Starting ===\n");

	if (led_init() < 0) {
		return 0;
	}

	if (ble_init() < 0) {
		return 0;
	}

	if (temperature_init() < 0) {
		return 0;
	}

	sensor_init();

	int32_t hall1 = 0, hall2 = 0;
	struct sensor_battery_status battery = { 0 };
	int battery_notify_divider = 0;

	while (1) {
		temperature_read();
		sensor_read_hall(&hall1, &hall2);
		sensor_calibration_update(hall1, hall2);
		if (sensor_should_trigger_left_click(hall1)) {
			mouse_left_click();
		}
		if (sensor_should_trigger_right_click(hall2)) {
			mouse_right_click();
		}
		mouse_switch_process();
		ble_notify_hall_sensors(hall1, hall2);
		if (++battery_notify_divider >= 20) {
			battery_notify_divider = 0;
			sensor_read_battery(&battery);
			ble_notify_battery(&battery);
		}

		k_sleep(K_MSEC(50)); // Read sensors every 50ms for smooth UI updates
	}
	return 0;
}
