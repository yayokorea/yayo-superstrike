#ifndef BLE_H
#define BLE_H

#include <stdint.h>

struct sensor_battery_status;

int ble_init(void);
int ble_notify_temperature(int32_t temperature);
int ble_notify_hall_sensors(int32_t hall1, int32_t hall2);
int ble_notify_battery(const struct sensor_battery_status *status);

#endif
