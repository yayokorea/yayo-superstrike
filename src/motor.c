#include "motor.h"

#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/init.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#define MOUSE_SWITCH_NODE DT_NODELABEL(gpio1)
#define MOUSE_RIGHT_SWITCH_PIN 11
#define MOUSE_LEFT_SWITCH_PIN 13

static const struct device *gpio1_dev;
static int64_t left_click_release_at;
static int64_t right_click_release_at;

void mouse_left_switch_set(bool state)
{
    if (!gpio1_dev || !device_is_ready(gpio1_dev)) {
        return;
    }

    gpio_pin_set(gpio1_dev, MOUSE_LEFT_SWITCH_PIN, state ? 1 : 0);
    printk("Mouse left switch (P1.13) %s\n", state ? "ON" : "OFF");
}

void mouse_right_switch_set(bool state)
{
    if (!gpio1_dev || !device_is_ready(gpio1_dev)) {
        return;
    }

    gpio_pin_set(gpio1_dev, MOUSE_RIGHT_SWITCH_PIN, state ? 1 : 0);
    printk("Mouse right switch (P1.11) %s\n", state ? "ON" : "OFF");
}

void mouse_left_click(void)
{
    mouse_left_switch_set(true);
    left_click_release_at = k_uptime_get() + 20;
}

void mouse_right_click(void)
{
    mouse_right_switch_set(true);
    right_click_release_at = k_uptime_get() + 20;
}

void mouse_switch_process(void)
{
    if ((left_click_release_at != 0) &&
        (k_uptime_get() >= left_click_release_at)) {
        mouse_left_switch_set(false);
        left_click_release_at = 0;
    }

    if ((right_click_release_at != 0) &&
        (k_uptime_get() >= right_click_release_at)) {
        mouse_right_switch_set(false);
        right_click_release_at = 0;
    }
}

static int mouse_switch_init(void)
{
    gpio1_dev = DEVICE_DT_GET(MOUSE_SWITCH_NODE);
    if (!device_is_ready(gpio1_dev)) {
        printk("GPIO device (gpio1) not ready!\n");
        return -1;
    }

    gpio_pin_configure(gpio1_dev, MOUSE_RIGHT_SWITCH_PIN, GPIO_OUTPUT_INACTIVE);
    gpio_pin_configure(gpio1_dev, MOUSE_LEFT_SWITCH_PIN, GPIO_OUTPUT_INACTIVE);
    printk("Mouse switches initialized on P1.11(right), P1.13(left)\n");
    return 0;
}

SYS_INIT(mouse_switch_init, APPLICATION, 0);
