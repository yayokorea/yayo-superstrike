#include "usb_console.h"

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/sys/printk.h>
#include <zephyr/usb/usb_device.h>
#include <zephyr/devicetree.h>

#define USB_CONSOLE_DEV DEVICE_DT_GET(DT_CHOSEN(zephyr_console))
#define DTR_WAIT_MS 2000
#define DTR_POLL_MS 50

void usb_console_init(void)
{
	const struct device *const dev = USB_CONSOLE_DEV;
	int err = usb_enable(NULL);
	uint32_t dtr = 0;
	int64_t deadline;

	if (err != 0) {
		printk("USB enable failed (err %d)\n", err);
		return;
	}

	if (!device_is_ready(dev)) {
		return;
	}

	(void)uart_line_ctrl_set(dev, UART_LINE_CTRL_DCD, 1);
	(void)uart_line_ctrl_set(dev, UART_LINE_CTRL_DSR, 1);

	deadline = k_uptime_get() + DTR_WAIT_MS;
	while (k_uptime_get() < deadline) {
		err = uart_line_ctrl_get(dev, UART_LINE_CTRL_DTR, &dtr);
		if (err == 0 && dtr != 0U) {
			break;
		}

		k_sleep(K_MSEC(DTR_POLL_MS));
	}
}
