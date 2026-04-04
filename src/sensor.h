#ifndef SENSOR_H
#define SENSOR_H

#include <stdbool.h>
#include <stdint.h>

enum {
    SENSOR_CALIB_CMD_HALL1_IDLE = 1,
    SENSOR_CALIB_CMD_HALL1_PRESS = 2,
    SENSOR_CALIB_CMD_HALL2_IDLE = 3,
    SENSOR_CALIB_CMD_HALL2_PRESS = 4,
};

struct sensor_calibration_status {
    int32_t hall1_idle;
    int32_t hall1_press;
    int32_t hall1_threshold;
    int32_t hall1_release;
    int32_t hall2_idle;
    int32_t hall2_press;
    int32_t hall2_threshold;
    int32_t hall2_release;
    uint8_t active_command;
    uint8_t sample_count;
    uint8_t hall1_ready;
    uint8_t hall2_ready;
};

struct sensor_battery_status {
    uint16_t millivolts;
    uint8_t percent;
};

void sensor_init(void);
void sensor_read_hall(int32_t *hall1, int32_t *hall2);
void sensor_read_battery(struct sensor_battery_status *status);
void sensor_calibration_update(int32_t hall1, int32_t hall2);
int sensor_start_calibration(uint8_t command);
void sensor_get_calibration_status(struct sensor_calibration_status *status);
bool sensor_should_trigger_left_click(int32_t hall1);
bool sensor_should_trigger_right_click(int32_t hall2);

#endif
