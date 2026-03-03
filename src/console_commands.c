#include <zephyr/shell/shell.h>
#include <zephyr/sys/reboot.h>
#include <hal/nrf_power.h>
#include <stdlib.h>
#include "led.h"

#define DFU_MAGIC_UF2_RESET           0x57

static int cmd_reboot(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "Rebooting...");
    sys_reboot(SYS_REBOOT_COLD);
    return 0;
}

static int cmd_dfu(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "Rebooting to DFU mode...");
#ifdef NRF52_SERIES
    nrf_power_gpregret_set(NRF_POWER, 0, DFU_MAGIC_UF2_RESET);
    NVIC_SystemReset();
#else
    sys_reboot(DFU_MAGIC_UF2_RESET);
#endif
    return 0;
}

static int cmd_led(const struct shell *sh, size_t argc, char **argv)
{
    if (argc < 2) {
        shell_error(sh, "Usage: led <brightness_percentage>");
        return -1;
    }
    
    int brightness = atoi(argv[1]);
    if (brightness < 0 || brightness > 100) {
        shell_error(sh, "Brightness must be between 0 and 100");
        return -1;
    }
    
    led_set_brightness((uint8_t)brightness);
    shell_print(sh, "LED brightness set to %d%%", brightness);
    return 0;
}

SHELL_CMD_REGISTER(reboot, NULL, "Reboot the device", cmd_reboot);
SHELL_CMD_REGISTER(dfu, NULL, "Reboot to DFU mode", cmd_dfu);
SHELL_CMD_REGISTER(led, NULL, "Set LED brightness (0-100)", cmd_led);
