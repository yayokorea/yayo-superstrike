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

    shell_print(sh, "Rebooting. MCUboot will run before returning to the application.");
    dfu_reboot_to_bootloader();
    return 0;
}

static int cmd_ota(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "Marking the uploaded image for test boot and rebooting...");
    dfu_reboot_to_ota();
    return 0;
}

SHELL_CMD_REGISTER(reboot, NULL, "Reboot the device", cmd_reboot);
SHELL_CMD_REGISTER(dfu, NULL, "Reboot through MCUboot", cmd_dfu);
SHELL_CMD_REGISTER(ota, NULL, "Test the uploaded MCUboot image and reboot", cmd_ota);
