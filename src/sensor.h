#ifndef SENSOR_H
#define SENSOR_H

#include <stdint.h>

void sensor_init(void);
void sensor_read_hall(int32_t *hall1, int32_t *hall2);

#endif
