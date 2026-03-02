#ifndef BLE_H
#define BLE_H

#include <stdint.h>

int ble_init(void);
int ble_notify_temperature(int32_t temperature);

#endif
