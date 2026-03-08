#include "dfu.h"

#include <zephyr/sys/reboot.h>
#include <hal/nrf_power.h>

#define DFU_MAGIC_UF2_RESET 0x57
#define DFU_MAGIC_OTA_RESET 0xA8

void dfu_reboot(void)
{
    sys_reboot(SYS_REBOOT_COLD);
}

void dfu_reboot_to_bootloader(void)
{
    NRF_POWER->GPREGRET = DFU_MAGIC_UF2_RESET;
    NVIC_SystemReset();
}

void dfu_reboot_to_ota(void)
{
    NRF_POWER->GPREGRET = DFU_MAGIC_OTA_RESET;
    NVIC_SystemReset();
}
