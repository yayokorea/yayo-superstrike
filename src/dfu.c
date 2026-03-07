#include "dfu.h"

#include <zephyr/sys/reboot.h>

#ifdef NRF52_SERIES
#include <hal/nrf_power.h>
#endif

#define DFU_MAGIC_UF2_RESET 0x57

void dfu_reboot(void)
{
    sys_reboot(SYS_REBOOT_COLD);
}

void dfu_reboot_to_bootloader(void)
{
#ifdef NRF52_SERIES
    nrf_power_gpregret_set(NRF_POWER, 0, DFU_MAGIC_UF2_RESET);
    NVIC_SystemReset();
#else
    sys_reboot(DFU_MAGIC_UF2_RESET);
#endif
}
