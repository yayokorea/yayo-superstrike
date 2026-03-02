#include "led.h"
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

int led_init(void)
{
	if (!gpio_is_ready_dt(&led)) {
		printk("Error: LED device %s is not ready\n", led.port->name);
		return -1;
	}

	int err = gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
	if (err < 0) {
		printk("Error: failed to configure led0\n");
		return err;
	}
	return 0;
}

void led_set(bool state)
{
	gpio_pin_set_dt(&led, state ? 1 : 0);
}

bool led_get(void)
{
	return gpio_pin_get_dt(&led) > 0;
}
