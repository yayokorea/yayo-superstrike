#include "usb_console.h"

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/usb/usb_device.h>

void usb_console_init(void)
{
	usb_enable(NULL);
}
