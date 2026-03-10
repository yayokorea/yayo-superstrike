#include "dfu.h"

#include <zephyr/dfu/mcuboot.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/reboot.h>

void dfu_reboot(void)
{
    sys_reboot(SYS_REBOOT_COLD);
}

void dfu_reboot_to_bootloader(void)
{
    sys_reboot(SYS_REBOOT_COLD);
}

void dfu_reboot_to_ota(void)
{
    int err = boot_request_upgrade(BOOT_UPGRADE_TEST);

    if (err == 0) {
        sys_reboot(SYS_REBOOT_COLD);
    } else {
        printk("Failed to request MCUboot test boot (err %d)\n", err);
    }
}
