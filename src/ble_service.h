#ifndef BLE_SERVICE_H
#define BLE_SERVICE_H

#include <stdint.h>

struct sensor_battery_status;

int ble_service_notify_temperature(int32_t temperature);
int ble_service_notify_hall_sensors(int32_t hall1, int32_t hall2);
int ble_service_notify_battery(const struct sensor_battery_status *status);

#endif
