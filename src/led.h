#ifndef LED_H
#define LED_H

#include <stdbool.h>

int led_init(void);
void led_set(bool state);
bool led_get(void);

#endif
