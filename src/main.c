#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#include "usb_console.h"
#include "led.h"
#include "ble.h"
#include "button.h"
#include "temperature.h"

int main(void)
{
	usb_console_init();

	printk("\n=== Zephyr BLE Peripheral Starting ===\n");

	if (led_init() < 0) {
		return 0;
	}

	if (button_init() < 0) {
		return 0;
	}

	if (ble_init() < 0) {
		return 0;
	}

	if (temperature_init() < 0) {
		return 0;
	}

	while (1) {
		temperature_read();
		k_sleep(K_SECONDS(1));
	}
	return 0;
}
