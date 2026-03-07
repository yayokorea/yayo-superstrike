#ifndef BLE_SERVICE_H
#define BLE_SERVICE_H

#include <stdint.h>

int ble_service_notify_temperature(int32_t temperature);
int ble_service_notify_hall_sensors(int32_t hall1, int32_t hall2);

#endif
