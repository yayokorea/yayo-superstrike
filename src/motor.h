#ifndef MOTOR_H
#define MOTOR_H

#include <stdbool.h>

void mouse_left_switch_set(bool state);
void mouse_right_switch_set(bool state);
void mouse_left_click(void);
void mouse_right_click(void);
void mouse_switch_process(void);

#endif
