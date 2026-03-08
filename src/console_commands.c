#include <zephyr/shell/shell.h>

#include "dfu.h"

static int cmd_reboot(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "Rebooting...");
    dfu_reboot();
    return 0;
}

static int cmd_dfu(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "Rebooting to DFU mode...");
    dfu_reboot_to_bootloader();
    return 0;
}

static int cmd_ota(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "Rebooting to OTA mode...");
    dfu_reboot_to_ota();
    return 0;
}

SHELL_CMD_REGISTER(reboot, NULL, "Reboot the device", cmd_reboot);
SHELL_CMD_REGISTER(dfu, NULL, "Reboot to DFU mode", cmd_dfu);
SHELL_CMD_REGISTER(ota, NULL, "Reboot to OTA mode", cmd_ota);
