#ifndef SENSOR_H
#define SENSOR_H

#include <stdbool.h>
#include <stdint.h>

void sensor_init(void);
void sensor_read_hall(int32_t *hall1, int32_t *hall2);
bool sensor_should_trigger_left_click(int32_t hall1);
bool sensor_should_trigger_right_click(int32_t hall2);

#endif
