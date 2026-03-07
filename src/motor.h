#ifndef MOTOR_H
#define MOTOR_H

#include <stdbool.h>

void motor_init(void);
void motor_set_vibration(int intensity);
void mouse_left_switch_set(bool state);
void mouse_right_switch_set(bool state);
void mouse_left_click(void);
void mouse_right_click(void);
void mouse_switch_process(void);

#endif
